export type InterpretationJobRecord = {
  id: string
  type: string
  status: string
  start_date: string
  end_date?: string
  details?: unknown
  errors?: unknown
}

export class PocketBaseError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function collectionUrl(): string {
  const base = (process.env.PB_URL ?? 'http://localhost:8090').replace(/\/+$/, '')
  return base + '/api/collections/jobs/records'
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new PocketBaseError(503, 'PocketBase no está disponible')
  }

  const payload = await response.json().catch(() => null) as { message?: unknown } | null
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : 'HTTP ' + response.status
    throw new PocketBaseError(response.status, 'PocketBase: ' + message)
  }
  return payload as T
}

export function createInterpretationJob(filename: string, size: number): Promise<InterpretationJobRecord> {
  return requestJson<InterpretationJobRecord>(collectionUrl(), {
    method: 'POST',
    body: JSON.stringify({
      type: 'interpretation',
      status: 'starting',
      start_date: new Date().toISOString(),
      details: { filename, size, phase: 'starting' },
      errors: { message: null },
    }),
  })
}

export function updateInterpretationJob(id: string, fields: Record<string, unknown>): Promise<InterpretationJobRecord> {
  return requestJson<InterpretationJobRecord>(collectionUrl() + '/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export async function getInterpretationJob(id: string): Promise<InterpretationJobRecord | null> {
  try {
    return await requestJson<InterpretationJobRecord>(collectionUrl() + '/' + encodeURIComponent(id))
  } catch (error) {
    if (error instanceof PocketBaseError && error.status === 404) return null
    throw error
  }
}

export async function listActiveInterpretationJobs(): Promise<InterpretationJobRecord[]> {
  const records: InterpretationJobRecord[] = []
  const filter = 'type = "interpretation" && (status = "starting" || status = "processing")'
  let page = 1
  let totalPages = 1
  do {
    const query = new URLSearchParams({ page: String(page), perPage: '500', filter })
    const result = await requestJson<{ items: InterpretationJobRecord[]; totalPages: number }>(collectionUrl() + '?' + query)
    records.push(...result.items)
    totalPages = result.totalPages
    page++
  } while (page <= totalPages)
  return records
}
