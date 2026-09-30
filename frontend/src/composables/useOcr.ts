import { onUnmounted, ref } from 'vue'
import { getJob, submitFile, type Job } from '@/api'

const POLLING_INTERVAL = 2000

export function useOcr() {
  const job = ref<Job | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let cancelled = false

  function wait(milliseconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds)
    })
  }

  function cancel() {
    cancelled = true
  }

  async function poll(jobId: string) {
    while (!cancelled) {
      job.value = await getJob(jobId)

      if (job.value.status === 'done') return
      if (job.value.status === 'error') {
        throw new Error(job.value.errors?.message || 'El procesamiento del archivo falló')
      }

      await wait(POLLING_INTERVAL)
    }
  }

  async function upload(file: File) {
    cancelled = false
    loading.value = true
    error.value = null
    job.value = null

    try {
      const { job_id } = await submitFile(file)
      await poll(job_id)
    } catch (err) {
      if (!cancelled) {
        error.value = err instanceof Error
          ? err.message
          : 'Ha ocurrido un error inesperado'
      }
    } finally {
      loading.value = false
    }
  }

  onUnmounted(cancel)

  return { job, loading, error, upload }
}
