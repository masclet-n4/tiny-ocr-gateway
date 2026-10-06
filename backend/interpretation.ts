import { createInterpretationJob, getInterpretationJob, listActiveInterpretationJobs, updateInterpretationJob, type InterpretationJobRecord } from './pocketbase.js'
import { fetchOcrJob, startOcrJob } from './ocr-proxy.js'
import { presignJsonResult, presignResult, saveInterpretationResult } from './rustfs.js'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_SCHEMA_BYTES = 512 * 1024
const OCR_POLL_INTERVAL_MS = 2000
const OCR_TIMEOUT_MS = 30 * 60 * 1000

type OpenRouterUsage = {
  cost: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
}

function usageSummary(value: unknown): OpenRouterUsage {
  const usage = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const numberOrNull = (key: keyof OpenRouterUsage) => typeof usage[key] === 'number' && Number.isFinite(usage[key]) ? usage[key] as number : null
  return {
    cost: numberOrNull('cost'),
    prompt_tokens: numberOrNull('prompt_tokens'),
    completion_tokens: numberOrNull('completion_tokens'),
    total_tokens: numberOrNull('total_tokens'),
  }
}

class InputError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function interpreterBaseUrl(): string {
  return (process.env.INTERPRETER_BASE_URL ?? 'http://localhost:3002').replace(/\/+$/, '')
}

function recordDetails(record: InterpretationJobRecord): Record<string, unknown> {
  return record.details && typeof record.details === 'object' && !Array.isArray(record.details)
    ? record.details as Record<string, unknown>
    : {}
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000)
}

async function validateSchema(schema: unknown): Promise<void> {
  let response: Response
  try {
    response = await fetch(interpreterBaseUrl() + '/validate-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new InputError(502, 'No se pudo validar el schema con el interpretador')
  }
  if (response.ok) return

  const payload = await response.json().catch(() => null) as { detail?: unknown } | null
  const detail = typeof payload?.detail === 'string' ? payload.detail : 'HTTP ' + response.status
  throw new InputError(response.status === 400 ? 400 : 502, detail)
}

async function failJob(jobId: string, details: Record<string, unknown>, error: unknown): Promise<void> {
  const message = errorMessage(error)
  try {
    await updateInterpretationJob(jobId, {
      status: 'error',
      details: { ...details, phase: 'error' },
      errors: { message },
      end_date: new Date().toISOString(),
    })
  } catch (updateError) {
    console.error('Could not mark interpretation job as error:', jobId, errorMessage(updateError))
  }
}

function accepted(jobId: string): Response {
  return Response.json({ job_id: jobId }, {
    status: 202,
    headers: { Location: '/interpret/jobs/' + encodeURIComponent(jobId) },
  })
}

export async function submitInterpretation(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_PDF_BYTES + MAX_SCHEMA_BYTES + 1024 * 1024) {
    return Response.json({ detail: 'La solicitud es demasiado grande' }, { status: 413 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return Response.json({ detail: 'Se esperaba multipart/form-data con file y schema' }, { status: 400 })
  const file = form.get('file')
  const schemaText = form.get('schema')
  if (!(file instanceof File) || typeof schemaText !== 'string') {
    return Response.json({ detail: 'Se requieren los campos file y schema' }, { status: 400 })
  }
  if (file.size < 1 || file.size > MAX_PDF_BYTES) {
    return Response.json({ detail: 'El PDF debe tener entre 1 byte y 10 MB' }, { status: 413 })
  }
  if (new TextEncoder().encode(schemaText).byteLength > MAX_SCHEMA_BYTES) {
    return Response.json({ detail: 'El schema supera el límite de 512 KB' }, { status: 413 })
  }

  let schema: unknown
  try {
    schema = JSON.parse(schemaText)
  } catch {
    return Response.json({ detail: 'schema debe contener JSON válido' }, { status: 400 })
  }
  try {
    await validateSchema(schema)
  } catch (error) {
    const status = error instanceof InputError ? error.status : 502
    return Response.json({ detail: errorMessage(error) }, { status })
  }

  let record: InterpretationJobRecord
  try {
    record = await createInterpretationJob(file.name.slice(0, 255) || 'document.pdf', file.size)
  } catch (error) {
    console.error('Could not create interpretation job:', errorMessage(error))
    return Response.json({ detail: 'No se pudo crear el job de interpretación' }, { status: 503 })
  }
  const details = recordDetails(record)

  let upstream: Response
  try {
    upstream = await startOcrJob(file)
  } catch (error) {
    await failJob(record.id, details, error)
    return accepted(record.id)
  }
  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => null) as { detail?: unknown } | null
    const detail = typeof payload?.detail === 'string' ? payload.detail : 'OCR respondió HTTP ' + upstream.status
    await failJob(record.id, details, new Error(detail))
    return accepted(record.id)
  }

  const ocrJob = await upstream.json().catch(() => null) as { job_id?: unknown } | null
  if (typeof ocrJob?.job_id !== 'string' || !ocrJob.job_id) {
    await failJob(record.id, details, new Error('OCR no devolvió job_id'))
    return accepted(record.id)
  }

  const runningDetails = { ...details, phase: 'ocr', ocr_job_id: ocrJob.job_id }
  try {
    await updateInterpretationJob(record.id, { status: 'processing', details: runningDetails })
  } catch (error) {
    await failJob(record.id, runningDetails, error)
    return accepted(record.id)
  }

  void runInterpretationJob(record.id, runningDetails, ocrJob.job_id, schema)
  return accepted(record.id)
}

async function waitForOcrResult(jobId: string): Promise<string> {
  const deadline = Date.now() + OCR_TIMEOUT_MS
  while (Date.now() < deadline) {
    const response = await fetchOcrJob(jobId, AbortSignal.timeout(15_000))
    const job = await response.json().catch(() => null) as {
      status?: unknown
      result_key?: unknown
      errors?: { message?: unknown }
    } | null
    if (!response.ok) throw new Error('No se pudo consultar el job OCR (HTTP ' + response.status + ')')
    if (job?.status === 'done') {
      if (typeof job.result_key !== 'string' || !job.result_key) throw new Error('El job OCR terminado no contiene result_key')
      return job.result_key
    }
    if (job?.status === 'error' || job?.status === 'stopped') {
      const message = typeof job.errors?.message === 'string' ? job.errors.message : 'El job OCR terminó con error'
      throw new Error(message)
    }
    await Bun.sleep(OCR_POLL_INTERVAL_MS)
  }
  throw new Error('El job OCR superó el tiempo máximo de espera')
}

async function interpret(textUrl: string, schema: unknown, jobId: string): Promise<{ result: unknown; usage: OpenRouterUsage }> {
  let response: Response
  try {
    response = await fetch(interpreterBaseUrl() + '/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-job-id': jobId },
      body: JSON.stringify({ text_url: textUrl, schema }),
      signal: AbortSignal.timeout(190_000),
    })
  } catch {
    throw new Error('No se pudo conectar con el interpretador')
  }
  const payload = await response.json().catch(() => null) as { detail?: unknown; result?: unknown; usage?: unknown } | null
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : 'HTTP ' + response.status
    throw new Error('Interpretador: ' + detail)
  }
  if (!payload || !Object.hasOwn(payload, 'result') || !Object.hasOwn(payload, 'usage')) {
    throw new Error('El interpretador no devolvió result y tokens/coste')
  }
  return { result: payload.result, usage: usageSummary(payload.usage) }
}

async function runInterpretationJob(
  jobId: string,
  details: Record<string, unknown>,
  ocrJobId: string,
  schema: unknown,
): Promise<void> {
  try {
    const textKey = await waitForOcrResult(ocrJobId)
    const interpretingDetails = { ...details, phase: 'interpreting' }
    await updateInterpretationJob(jobId, { status: 'processing', details: interpretingDetails })

    const textUrl = await presignResult(textKey)
    const { result, usage } = await interpret(textUrl, schema, jobId)
    const resultKey = await saveInterpretationResult(jobId, result)
    await updateInterpretationJob(jobId, {
      status: 'done',
      details: { ...interpretingDetails, phase: 'done', result_key: resultKey, openrouter_usage: usage },
      errors: { message: null },
      end_date: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Interpretation job failed:', jobId, errorMessage(error))
    await failJob(jobId, details, error)
  }
}

function statusPayload(record: InterpretationJobRecord): Record<string, unknown> {
  const details = recordDetails(record)
  const result: Record<string, unknown> = {
    job_id: record.id,
    status: record.status,
    phase: details.phase ?? record.status,
  }
  if (typeof details.filename === 'string') result.filename = details.filename
  if (typeof details.size === 'number') result.size = details.size
  if (record.status === 'done') result.result_url = '/interpret/jobs/' + encodeURIComponent(record.id) + '/result'
  if (record.status === 'error' || record.status === 'stopped') result.errors = record.errors
  return result
}

async function loadInterpretationJob(jobId: string): Promise<InterpretationJobRecord | null> {
  const record = await getInterpretationJob(jobId)
  return record?.type === 'interpretation' ? record : null
}

export async function getInterpretationStatus(jobId: string): Promise<Response> {
  try {
    const record = await loadInterpretationJob(jobId)
    return record ? Response.json(statusPayload(record)) : Response.json({ detail: 'Job no encontrado' }, { status: 404 })
  } catch (error) {
    console.error('Could not read interpretation job:', jobId, errorMessage(error))
    return Response.json({ detail: 'No se pudo consultar el job' }, { status: 503 })
  }
}

export async function getInterpretationResult(jobId: string): Promise<Response> {
  try {
    const record = await loadInterpretationJob(jobId)
    if (!record) return Response.json({ detail: 'Job no encontrado' }, { status: 404 })
    if (record.status !== 'done') return Response.json({ detail: 'El job aún no ha terminado' }, { status: 409 })

    const expectedKey = 'interpretations/' + jobId + '.json'
    if (recordDetails(record).result_key !== expectedKey) {
      return Response.json({ detail: 'El job terminado no contiene result_key' }, { status: 500 })
    }
    return new Response(null, {
      status: 302,
      headers: { Location: await presignJsonResult(expectedKey), 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Could not prepare interpretation download:', jobId, errorMessage(error))
    return Response.json({ detail: 'No se pudo preparar la descarga del resultado' }, { status: 502 })
  }
}

export async function stopInterruptedInterpretationJobs(): Promise<void> {
  const jobs = await listActiveInterpretationJobs()
  const endDate = new Date().toISOString()
  for (const record of jobs) {
    await updateInterpretationJob(record.id, {
      status: 'stopped',
      details: { ...recordDetails(record), phase: 'stopped' },
      errors: { message: 'El gateway se reinició mientras el job estaba en curso' },
      end_date: endDate,
    })
  }
}

