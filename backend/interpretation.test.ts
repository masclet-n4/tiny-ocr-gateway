import { afterEach, describe, expect, it } from 'bun:test'
import { handleRequest } from './server.js'
import { stopInterruptedInterpretationJobs } from './interpretation.js'

const originalEnv = {
  PB_URL: process.env.PB_URL,
  OCR_BASE_URL: process.env.OCR_BASE_URL,
  INTERPRETER_BASE_URL: process.env.INTERPRETER_BASE_URL,
  RUSTFS_ENDPOINT: process.env.RUSTFS_ENDPOINT,
  RUSTFS_BUCKET: process.env.RUSTFS_BUCKET,
  RUSTFS_ACCESS_KEY: process.env.RUSTFS_ACCESS_KEY,
  RUSTFS_SECRET_KEY: process.env.RUSTFS_SECRET_KEY,
  RUSTFS_REGION: process.env.RUSTFS_REGION,
  RUSTFS_URL_EXPIRES_SECONDS: process.env.RUSTFS_URL_EXPIRES_SECONDS,
}

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('gateway interpretation pipeline', () => {
  it('coordinates OCR and interpretation, stores JSON and serves a signed result link', async () => {
    const parentJobId = 'interpjob123456'
    let parentJob: Record<string, unknown> | null = null
    let savedKey = ''
    let savedBody = ''
    const pb = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const basePath = '/api/collections/jobs/records'
        if (url.pathname === basePath && request.method === 'POST') {
          parentJob = { id: parentJobId, ...await request.json() as Record<string, unknown> }
          return Response.json(parentJob)
        }
        if (url.pathname === basePath + '/' + parentJobId && request.method === 'PATCH') {
          parentJob = { ...parentJob, ...await request.json() as Record<string, unknown> }
          return Response.json(parentJob)
        }
        if (url.pathname === basePath + '/' + parentJobId && request.method === 'GET' && parentJob) {
          return Response.json(parentJob)
        }
        return Response.json({ message: 'not found' }, { status: 404 })
      },
    })
    const ocr = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/ocr/async' && request.method === 'POST') {
          const form = await request.formData()
          expect(form.get('file')).toBeInstanceOf(File)
          return Response.json({ job_id: 'ocrjob123456789' })
        }
        if (url.pathname === '/jobs/ocrjob123456789') {
          return Response.json({ job_id: 'ocrjob123456789', status: 'done', result_key: 'ocrjob123456789.txt' })
        }
        return new Response('not found', { status: 404 })
      },
    })
    const interpreter = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/validate-schema') return Response.json({ valid: true })
        if (url.pathname === '/interpret') {
          const body = await request.json() as { text_url?: string; schema?: unknown }
          expect(body.text_url).toContain('/ocr-results/ocrjob123456789.txt')
          expect(request.headers.get('x-job-id')).toBe(parentJobId)
          return Response.json({
            result: { title: 'Ada' },
            usage: {
              prompt_tokens: 12,
              completion_tokens: 5,
              total_tokens: 17,
              cost: 0.0002,
              prompt_tokens_details: { cached_tokens: 2 },
            },
          })
        }
        return new Response('not found', { status: 404 })
      },
    })
    const rustfs = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        if (request.method === 'PUT') {
          savedKey = new URL(request.url).pathname
          savedBody = await request.text()
          return new Response(null, { status: 200, headers: { ETag: '"test-etag"' } })
        }
        return new Response('not found', { status: 404 })
      },
    })

    Object.assign(process.env, {
      PB_URL: pb.url.origin,
      OCR_BASE_URL: ocr.url.origin,
      INTERPRETER_BASE_URL: interpreter.url.origin,
      RUSTFS_ENDPOINT: rustfs.url.origin,
      RUSTFS_BUCKET: 'ocr-results',
      RUSTFS_ACCESS_KEY: 'test-access',
      RUSTFS_SECRET_KEY: 'test-secret',
      RUSTFS_REGION: 'us-east-1',
      RUSTFS_URL_EXPIRES_SECONDS: '120',
    })

    try {
      const form = new FormData()
      form.append('file', new File(['%PDF-test'], 'document.pdf', { type: 'application/pdf' }))
      form.append('schema', JSON.stringify({ type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }))
      const accepted = await handleRequest(new Request('http://gateway.local/interpret/async', { method: 'POST', body: form }))
      expect(accepted.status).toBe(202)
      expect(await accepted.json()).toEqual({ job_id: parentJobId })

      let job: Record<string, unknown> = {}
      for (let attempt = 0; attempt < 100; attempt++) {
        const response = await handleRequest(new Request('http://gateway.local/interpret/jobs/' + parentJobId))
        job = await response.json() as Record<string, unknown>
        if (job.status === 'done' || job.status === 'error') break
        await Bun.sleep(10)
      }

      expect(job.status).toBe('done')
      expect(job.result_url).toBe('/interpret/jobs/' + parentJobId + '/result')
      expect(savedKey).toBe('/ocr-results/interpretations/' + parentJobId + '.json')
      expect(JSON.parse(savedBody)).toEqual({ title: 'Ada' })

      const download = await handleRequest(new Request('http://gateway.local' + String(job.result_url)))
      expect(download.status).toBe(302)
      expect(download.headers.get('Location')).toContain('X-Amz-Signature=')
      expect(download.headers.get('Location')).toContain('interpretations/' + parentJobId + '.json')
      const storedJob = parentJob as unknown as Record<string, unknown>
      const storedDetails = storedJob.details as Record<string, unknown>
      expect(storedDetails.result_key).toBe('interpretations/' + parentJobId + '.json')
      expect(storedDetails.openrouter_usage).toEqual({
        cost: 0.0002,
        prompt_tokens: 12,
        completion_tokens: 5,
        total_tokens: 17,
      })
      expect(storedDetails).not.toHaveProperty('openrouter')
      expect(storedDetails.openrouter_usage).not.toHaveProperty('prompt_tokens_details')
    } finally {
      pb.stop(true)
      ocr.stop(true)
      interpreter.stop(true)
      rustfs.stop(true)
    }
  })


  it('marks active interpretation jobs stopped at gateway startup', async () => {
    const jobId = 'stalejob1234567'
    const state = {
      record: {
        id: jobId,
        type: 'interpretation',
        status: 'processing',
        details: { phase: 'ocr' },
      } as Record<string, unknown>,
    }
    const pb = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const basePath = '/api/collections/jobs/records'
        if (url.pathname === basePath && request.method === 'GET') {
          expect(url.searchParams.get('filter')).toContain('interpretation')
          return Response.json({ items: [state.record], totalPages: 1 })
        }
        if (url.pathname === basePath + '/' + jobId && request.method === 'PATCH') {
          state.record = { ...state.record, ...await request.json() as Record<string, unknown> }
          return Response.json(state.record)
        }
        return Response.json({ message: 'not found' }, { status: 404 })
      },
    })
    process.env.PB_URL = pb.url.origin

    try {
      await stopInterruptedInterpretationJobs()
      expect(state.record.status).toBe('stopped')
      expect((state.record.details as Record<string, unknown>).phase).toBe('stopped')
      expect((state.record.errors as Record<string, unknown>).message).toContain('reinició')
    } finally {
      pb.stop(true)
    }
  })
})
