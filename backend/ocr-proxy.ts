const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

function ocrBaseUrl(): string {
  return (process.env.OCR_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export function isOcrPath(pathname: string): boolean {
  return pathname === '/alive'
    || pathname === '/ocr'
    || pathname.startsWith('/ocr/')
    || /^\/jobs\/[^/]+$/.test(pathname)
}

export function forwardedHeaders(source: Headers, request = false): Headers {
  const headers = new Headers(source)
  const connectionTokens = headers.get('connection')?.split(',').map((value) => value.trim()) ?? []

  for (const name of [...HOP_BY_HOP_HEADERS, ...connectionTokens]) headers.delete(name)
  if (request) {
    headers.delete('host')
    headers.delete('content-length')
  }

  return headers
}

export async function proxyToOcr(request: Request, url: URL): Promise<Response> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: forwardedHeaders(request.headers, true),
    redirect: 'manual',
    signal: request.signal,
  }

  if (hasBody && request.body) {
    init.body = request.body
    init.duplex = 'half'
  }

  try {
    const upstream = await fetch(ocrBaseUrl() + url.pathname + url.search, init)
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: forwardedHeaders(upstream.headers),
    })
  } catch (error) {
    console.error('OCR upstream request failed:', error)
    return Response.json({ detail: 'El servicio OCR no está disponible' }, { status: 502 })
  }
}

export function fetchOcrJob(jobId: string, signal: AbortSignal): Promise<Response> {
  return fetch(ocrBaseUrl() + '/jobs/' + encodeURIComponent(jobId), { signal })
}