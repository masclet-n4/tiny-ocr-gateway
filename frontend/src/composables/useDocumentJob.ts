import { onUnmounted, ref } from 'vue'
import { getJob, submitJob, type Job, type Operation } from '@/api'

const POLLING_INTERVAL = 2000
const TERMINAL_STATUSES = new Set(['done', 'error', 'stopped'])

export function useDocumentJob() {
  const job = ref<Job | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let cancelled = false

  function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }

  function cancel() {
    cancelled = true
  }

  function clear() {
    if (loading.value) return
    cancelled = true
    job.value = null
    error.value = null
  }

  async function poll(jobId: string, operation: Operation) {
    while (!cancelled) {
      job.value = await getJob(jobId, operation)
      if (TERMINAL_STATUSES.has(job.value.status)) return
      await wait(POLLING_INTERVAL)
    }
  }

  async function run(operation: Operation, action: () => Promise<string>) {
    if (loading.value) return
    cancelled = false
    loading.value = true
    error.value = null
    job.value = null

    try {
      const jobId = await action()
      if (cancelled) return
      job.value = { job_id: jobId, status: 'starting' }
      await poll(jobId, operation)
    } catch (err) {
      if (!cancelled) {
        error.value = err instanceof Error ? err.message : 'Ha ocurrido un error inesperado'
      }
    } finally {
      loading.value = false
    }
  }

  function process(file: File, operation: Operation, schema?: unknown) {
    return run(operation, async () => (await submitJob(file, operation, schema)).job_id)
  }

  function resume(jobId: string, operation: Operation) {
    return run(operation, async () => jobId.trim())
  }

  onUnmounted(cancel)
  return { job, loading, error, process, resume, clear }
}
