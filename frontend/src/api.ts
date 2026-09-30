export type JobStatus = 'starting' | 'processing' | 'done' | 'error'

export type Job = {
  job_id: string
  status: JobStatus
  filename?: string
  size?: number
  pages_processed?: number
  total_pages?: number
  pages_text_layer?: number
  avg_score?: number
  result_key?: string
  errors?: { message?: string | null }
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as { detail?: string } | null
  const retryAfter = response.headers.get('Retry-After')

  if (response.status === 429) {
    throw new Error('OCR ocupado. Reintenta en ' + (retryAfter ?? 'unos') + ' segundos.')
  }

  throw new Error(payload?.detail ?? fallback + ' (HTTP ' + response.status + ')')
}

export async function submitFile(file: File): Promise<{ job_id: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/ocr/async', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    return throwApiError(response, 'No se pudo subir el archivo')
  }

  return response.json()
}

export async function getJob(jobId: string): Promise<Job> {
  const response = await fetch('/jobs/' + encodeURIComponent(jobId))

  if (!response.ok) {
    return throwApiError(response, 'No se pudo consultar el job')
  }

  return response.json()
}

export function getResultUrl(jobId: string): string {
  return '/download/' + encodeURIComponent(jobId)
}
