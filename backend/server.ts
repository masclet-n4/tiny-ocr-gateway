import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fetchOcrJob, forwardedHeaders, isOcrPath, proxyToOcr } from './ocr-proxy.js'
import { getResultKey, presignResult } from './rustfs.js'
import { getInterpretationResult, getInterpretationStatus, stopInterruptedInterpretationJobs, submitInterpretation } from './interpretation.js'

const PORT = Number(process.env.PORT ?? 3001)
const DIST_DIR = resolve(import.meta.dir, '../dist')

async function downloadRedirect(jobId: string, request: Request): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetchOcrJob(jobId, request.signal)
  } catch (error) {
    console.error('OCR job lookup failed:', error)
    return Response.json({ detail: 'El servicio OCR no está disponible' }, { status: 502 })
  }

  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: forwardedHeaders(upstream.headers),
    })
  }

  try {
    const key = getResultKey(await upstream.json())
    if (!key) return Response.json({ detail: 'El job OCR aún no ha terminado' }, { status: 409 })

    return new Response(null, {
      status: 302,
      headers: { Location: await presignResult(key), 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Could not create RustFS download URL:', error)
    return Response.json({ detail: 'No se pudo preparar la descarga del resultado' }, { status: 502 })
  }
}

async function serveStatic(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const filePath = resolve(DIST_DIR, '.' + pathname)
  const relativePath = relative(DIST_DIR, filePath)
  if (relativePath === '..' || relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) {
    return new Response('Not Found', { status: 404 })
  }

  const file = Bun.file(filePath)
  if (await file.exists()) return new Response(request.method === 'HEAD' ? null : file)
  if (extname(pathname) || pathname.startsWith('/assets/')) return new Response('Not Found', { status: 404 })

  const index = Bun.file(resolve(DIST_DIR, 'index.html'))
  if (!(await index.exists())) {
    return new Response('Frontend build not found. Run pnpm build.', { status: 503 })
  }
  return new Response(request.method === 'HEAD' ? null : index)
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/interpret/async') {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
    }
    return submitInterpretation(request)
  }

  const interpretationResult = /^\/interpret\/jobs\/([a-z0-9]{15})\/result$/.exec(url.pathname)
  if (interpretationResult) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } })
    }
    return getInterpretationResult(interpretationResult[1])
  }

  const interpretationJob = /^\/interpret\/jobs\/([a-z0-9]{15})$/.exec(url.pathname)
  if (interpretationJob) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } })
    }
    return getInterpretationStatus(interpretationJob[1])
  }

  if (url.pathname.startsWith('/download/')) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } })
    }
    const match = /^\/download\/([a-z0-9]{15})$/.exec(url.pathname)
    if (!match) return new Response('Not Found', { status: 404 })
    return downloadRedirect(match[1], request)
  }

  if (isOcrPath(url.pathname)) return proxyToOcr(request, url)
  return serveStatic(request, url)
}

if (import.meta.main) {
  try {
    await stopInterruptedInterpretationJobs()
  } catch (error) {
    console.error('Could not mark interrupted interpretation jobs:', error)
  }

  const server = Bun.serve({
    port: PORT,
    hostname: process.env.HOST ?? '0.0.0.0',
    fetch(request, server) {
      const pathname = new URL(request.url).pathname
      if (isOcrPath(pathname) || pathname === '/interpret/async') server.timeout(request, 255)
      return handleRequest(request)
    },
  })
  console.log('ocr-front listening on ' + server.url)
}