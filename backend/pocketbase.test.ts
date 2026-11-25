import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { createInterpretationJob, getInterpretationJob, listActiveInterpretationJobs, PocketBaseError } from './pocketbase.js'

const originalEnv = { PB_URL: process.env.PB_URL, PB_EMAIL: process.env.PB_EMAIL, PB_PASSWORD: process.env.PB_PASSWORD }

function token(exp: number): string {
  return `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`
}

describe('PocketBase authentication', () => {
  let server: ReturnType<typeof Bun.serve>
  let loginCount: number
  let recordCount: number
  let issuedToken: string
  let rejectLogin: boolean
  let returnInvalidToken: boolean

  beforeEach(() => {
    loginCount = 0
    recordCount = 0
    issuedToken = ''
    rejectLogin = false
    returnInvalidToken = false
    process.env.PB_EMAIL = `${crypto.randomUUID()}@example.com`
    process.env.PB_PASSWORD = 'test-password'
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/api/collections/service_accounts/auth-with-password') {
          loginCount++
          expect(request.method).toBe('POST')
          expect(await request.json()).toEqual({ identity: process.env.PB_EMAIL, password: 'test-password' })
          await Bun.sleep(10)
          if (rejectLogin) return Response.json({ message: 'invalid credentials' }, { status: 400 })
          issuedToken = returnInvalidToken ? 'invalid' : token(Math.floor(Date.now() / 1000) + 180)
          return Response.json({ token: issuedToken })
        }
        recordCount++
        if (request.headers.get('Authorization') !== issuedToken) return new Response(null, { status: 403 })
        if (url.pathname === '/api/collections/jobs/records' && request.method === 'GET') {
          return Response.json({ items: [], totalPages: 1 })
        }
        return Response.json({ id: 'job-id', type: 'interpretation', status: 'starting' })
      },
    })
    process.env.PB_URL = server.url.origin
  })

  afterEach(() => {
    server.stop(true)
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('shares one login across concurrent requests and sends its token', async () => {
    const [created, found, active] = await Promise.all([
      createInterpretationJob('document.pdf', 10),
      getInterpretationJob('job-id'),
      listActiveInterpretationJobs(),
    ])
    expect(created.id).toBe('job-id')
    expect(found?.id).toBe('job-id')
    expect(active).toEqual([])
    expect(loginCount).toBe(1)
    expect(recordCount).toBe(3)
  })

  it('renews shortly before the token expires', async () => {
    const now = Date.now()
    const clock = spyOn(Date, 'now').mockReturnValue(now)
    try {
      await listActiveInterpretationJobs()
      await listActiveInterpretationJobs()
      expect(loginCount).toBe(1)
      clock.mockReturnValue(now + 125_000)
      await listActiveInterpretationJobs()
      expect(loginCount).toBe(2)
    } finally {
      clock.mockRestore()
    }
  })

  it('does not send job requests when credentials are missing', async () => {
    delete process.env.PB_PASSWORD
    await expect(listActiveInterpretationJobs()).rejects.toThrow('Faltan PB_EMAIL o PB_PASSWORD')
    expect(loginCount).toBe(0)
    expect(recordCount).toBe(0)
  })

  it('does not send job requests when authentication fails or returns an invalid token', async () => {
    rejectLogin = true
    await expect(createInterpretationJob('document.pdf', 10)).rejects.toBeInstanceOf(PocketBaseError)
    expect(recordCount).toBe(0)
    rejectLogin = false
    returnInvalidToken = true
    await expect(createInterpretationJob('document.pdf', 10)).rejects.toThrow('token válido')
    expect(loginCount).toBe(2)
    expect(recordCount).toBe(0)
  })
})
