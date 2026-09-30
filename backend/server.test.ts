import { describe, expect, it } from 'bun:test'
import { handleRequest } from './server.js'
import { getResultKey } from './rustfs.js'

describe('getResultKey', () => {
  it('uses the result_key from a completed Python job without changing it', () => {
    expect(getResultKey({ status: 'done', result_key: 'ocr/result.txt' })).toBe('ocr/result.txt')
  })

  it('does not create a download link before the job is done', () => {
    expect(getResultKey({ status: 'processing', result_key: 'result.txt' })).toBeNull()
  })

  it('rejects a completed job without a result_key', () => {
    expect(() => getResultKey({ status: 'done' })).toThrow('result_key')
  })
})

describe('Bun connector', () => {
  it('serves the Vue build with SPA fallback and blocks paths outside dist', async () => {
    const app = await handleRequest(new Request('http://front.local/'))
    expect(app.status).toBe(200)
    expect(await app.text()).toContain('<div id="app">')

    const route = await handleRequest(new Request('http://front.local/jobs-ui'))
    expect(route.status).toBe(200)

    const traversal = await handleRequest(new Request('http://front.local/%2e%2e%2fserver.ts'))
    expect(traversal.status).toBe(404)
  })

  it('passes through the OCR 429 and Retry-After header unchanged', async () => {
    const previous = process.env.OCR_BASE_URL
    const upstream = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response('busy', { status: 429, headers: { 'Retry-After': '5' } }),
    })
    process.env.OCR_BASE_URL = upstream.url.origin

    try {
      const response = await handleRequest(new Request('http://front.local/ocr/async', {
        method: 'POST',
        body: 'multipart payload',
      }))
      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(await response.text()).toBe('busy')
    } finally {
      upstream.stop(true)
      if (previous === undefined) delete process.env.OCR_BASE_URL
      else process.env.OCR_BASE_URL = previous
    }
  })

  it('redirects completed OCR jobs to a presigned RustFS URL using result_key', async () => {
    const previous = {
      OCR_BASE_URL: process.env.OCR_BASE_URL,
      RUSTFS_ENDPOINT: process.env.RUSTFS_ENDPOINT,
      RUSTFS_BUCKET: process.env.RUSTFS_BUCKET,
      RUSTFS_ACCESS_KEY: process.env.RUSTFS_ACCESS_KEY,
      RUSTFS_SECRET_KEY: process.env.RUSTFS_SECRET_KEY,
      RUSTFS_URL_EXPIRES_SECONDS: process.env.RUSTFS_URL_EXPIRES_SECONDS,
    }
    const upstream = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => Response.json({ status: 'done', result_key: 'results/job.txt' }),
    })
    Object.assign(process.env, {
      OCR_BASE_URL: upstream.url.origin,
      RUSTFS_ENDPOINT: 'https://rustfs.example',
      RUSTFS_BUCKET: 'ocr-results',
      RUSTFS_ACCESS_KEY: 'test-access',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_URL_EXPIRES_SECONDS: '120',
    })

    try {
      const response = await handleRequest(new Request('http://front.local/download/a123456789abcde'))
      const location = response.headers.get('Location') ?? ''
      expect(response.status).toBe(302)
      expect(location).toContain('X-Amz-Signature=')
      expect(location).toContain('X-Amz-Expires=120')
      expect(location).toContain('results/job.txt')
    } finally {
      upstream.stop(true)
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })
})