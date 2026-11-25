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

type AuthConfig = { base: string; email: string; password: string }
type AuthToken = { token: string; expiresAt: number }

let cachedAuth: (AuthConfig & AuthToken) | undefined
let pendingAuth: (AuthConfig & { promise: Promise<AuthToken> }) | undefined

function baseUrl(): string {
  return (process.env.PB_URL ?? 'http://localhost:8090').replace(/\/+$/, '')
}

function collectionUrl(): string {
  return baseUrl() + '/api/collections/jobs/records'
}

function sameConfig(a: AuthConfig, b: AuthConfig): boolean {
  return a.base === b.base && a.email === b.email && a.password === b.password
}

async function authenticate(config: AuthConfig): Promise<AuthToken> {
  let response: Response
  try {
    response = await fetch(config.base + '/api/collections/service_accounts/auth-with-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: config.email, password: config.password }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new PocketBaseError(503, 'PocketBase no está disponible')
  }
  if (!response.ok) throw new PocketBaseError(503, 'No se pudo autenticar con PocketBase')

  const payload = await response.json().catch(() => null) as { token?: unknown } | null
  const token = payload?.token
  try {
    if (typeof token !== 'string' || token.split('.').length !== 3) throw new Error()
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: unknown }
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) throw new Error()
    const expiresAt = decoded.exp * 1000 - 60_000
    if (expiresAt <= Date.now()) throw new Error()
    return { token, expiresAt }
  } catch {
    throw new PocketBaseError(503, 'PocketBase no devolvió un token válido')
  }
}

async function authToken(): Promise<string> {
  const config = { base: baseUrl(), email: process.env.PB_EMAIL ?? '', password: process.env.PB_PASSWORD ?? '' }
  if (!config.email || !config.password) throw new PocketBaseError(503, 'Faltan PB_EMAIL o PB_PASSWORD')
  if (cachedAuth && sameConfig(cachedAuth, config) && Date.now() < cachedAuth.expiresAt) return cachedAuth.token
  if (pendingAuth && sameConfig(pendingAuth, config)) return (await pendingAuth.promise).token

  const pending = { ...config, promise: authenticate(config) }
  pendingAuth = pending
  try {
    const auth = await pending.promise
    if (pendingAuth === pending) cachedAuth = { ...config, ...auth }
    return auth.token
  } finally {
    if (pendingAuth === pending) pendingAuth = undefined
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await authToken()
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: token },
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
