export type Operation = 'ocr' | 'interpret'
export type JobStatus = 'starting' | 'processing' | 'done' | 'error' | 'stopped'

export type Job = {
  job_id: string
  status: JobStatus
  phase?: string
  filename?: string
  size?: number
  pages_processed?: number
  total_pages?: number
  pages_text_layer?: number
  avg_score?: number
  result_key?: string
  result_url?: string
  errors?: { message?: string | null }
}


export function parseJsonSchema(text: string): unknown {
  let schema: unknown
  try {
    schema = JSON.parse(text)
  } catch {
    throw new Error('El schema no contiene JSON válido.')
  }
  if (!(typeof schema === 'boolean' || (schema !== null && typeof schema === 'object' && !Array.isArray(schema)))) {
    throw new Error('El JSON Schema debe ser un objeto o booleano.')
  }
  return schema
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as { detail?: string } | null
  const retryAfter = response.headers.get('Retry-After')

  if (response.status === 429) {
    throw new Error('El OCR está ocupado. Reintenta en ' + (retryAfter ?? 'unos') + ' segundos.')
  }

  throw new Error(payload?.detail ?? fallback + ' (HTTP ' + response.status + ')')
}

export async function submitJob(file: File, operation: Operation, schema?: unknown): Promise<{ job_id: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const endpoint = operation === 'interpret' ? '/interpret/async' : '/ocr/async'
  if (operation === 'interpret') {
    if (schema === undefined) throw new Error('Falta el JSON Schema')
    formData.append('schema', JSON.stringify(schema))
  }

  const response = await fetch(endpoint, { method: 'POST', body: formData })
  if (!response.ok) return throwApiError(response, 'No se pudo iniciar el procesamiento')
  return await response.json() as { job_id: string }
}

export async function getJob(jobId: string, operation: Operation): Promise<Job> {
  const path = operation === 'interpret'
    ? '/interpret/jobs/' + encodeURIComponent(jobId)
    : '/jobs/' + encodeURIComponent(jobId)
  const response = await fetch(path)
  if (!response.ok) return throwApiError(response, 'No se pudo consultar el job')
  return await response.json() as Job
}

export function getResultUrl(jobId: string, operation: Operation): string {
  const id = encodeURIComponent(jobId)
  return operation === 'interpret' ? '/interpret/jobs/' + id + '/result' : '/download/' + id
}
