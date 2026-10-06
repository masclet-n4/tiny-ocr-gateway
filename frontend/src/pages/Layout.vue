<template>
  <main class="min-h-screen bg-slate-50 px-4 py-6 pb-10 sm:px-6 sm:py-10">
    <div class="mx-auto w-full max-w-xl space-y-5">
      <header class="space-y-2">
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Herramienta de prueba</p>
        <h1 class="text-3xl font-bold tracking-tight text-slate-950">Documentos PDF</h1>
        <p class="text-base leading-6 text-slate-600">Extrae el texto o conviértelo en JSON usando tu propio schema.</p>
      </header>

      <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="new-job-title">
        <h2 id="new-job-title" class="text-lg font-semibold text-slate-950">Nuevo procesamiento</h2>

        <fieldset class="mt-4">
          <legend class="mb-2 text-sm font-medium text-slate-700">¿Qué quieres hacer?</legend>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-[4.25rem] rounded-xl border px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              :class="mode === 'ocr' ? 'border-blue-700 bg-blue-50 ring-1 ring-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50'"
              :aria-pressed="mode === 'ocr'"
              :disabled="loading"
              @click="setMode('ocr')"
            >
              <span class="block text-sm font-semibold text-slate-950">Extraer texto</span>
              <span class="mt-1 block text-xs text-slate-600">PDF → TXT</span>
            </button>
            <button
              type="button"
              class="min-h-[4.25rem] rounded-xl border px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              :class="mode === 'interpret' ? 'border-blue-700 bg-blue-50 ring-1 ring-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50'"
              :aria-pressed="mode === 'interpret'"
              :disabled="loading"
              @click="setMode('interpret')"
            >
              <span class="block text-sm font-semibold text-slate-950">Obtener JSON</span>
              <span class="mt-1 block text-xs text-slate-600">PDF + schema → JSON</span>
            </button>
          </div>
        </fieldset>

        <form class="mt-6 space-y-5" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <h3 class="text-sm font-semibold text-slate-900">1. Selecciona un PDF</h3>
            <DropZone :file="file" :disabled="loading" @select="selectFile" @remove="removeFile" />
          </div>

          <div v-if="mode === 'interpret'" class="space-y-3">
            <div>
              <label for="schema-input" class="text-sm font-semibold text-slate-900">2. Añade un JSON Schema</label>
              <p id="schema-help" class="mt-1 text-sm leading-5 text-slate-600">
                El texto del PDF se enviará a OpenRouter para generar el JSON.
              </p>
            </div>

            <textarea
              id="schema-input"
              v-model="schemaText"
              rows="8"
              spellcheck="false"
              autocapitalize="off"
              class="block min-h-48 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-base leading-6 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 disabled:bg-slate-100"
              :disabled="loading"
              :aria-invalid="Boolean(schemaError)"
              :aria-describedby="schemaError ? 'schema-help schema-error' : 'schema-help'"
              placeholder='{"type":"object","properties":{"campo":{"type":"string"}},"required":["campo"],"additionalProperties":false}'
              @input="onSchemaInput"
            />

            <div class="flex flex-wrap items-center gap-3">
              <input
                id="schema-file"
                class="peer sr-only"
                type="file"
                accept=".json,application/json"
                :disabled="loading"
                @change="onSchemaFile"
              />
              <label
                for="schema-file"
                class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-700"
                :class="loading ? 'cursor-not-allowed opacity-50' : ''"
              >
                Cargar archivo .json
              </label>
              <span class="text-xs text-slate-500">Máximo 512 KB</span>
            </div>
            <p id="schema-error" v-if="schemaError" class="text-sm text-red-700" role="alert">{{ schemaError }}</p>
          </div>

          <button
            type="submit"
            class="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
            :disabled="!file || loading || (mode === 'interpret' && Boolean(schemaError))"
          >
            {{ loading ? 'Procesando…' : mode === 'ocr' ? 'Extraer texto' : 'Generar JSON' }}
          </button>
        </form>
      </section>

      <section v-if="job || error || loading" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-live="polite" aria-atomic="true">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Estado del job</p>
            <h2 class="mt-1 text-lg font-semibold text-slate-950">{{ job ? statusLabel(job.status) : loading ? 'Enviando solicitud' : 'No se pudo completar' }}</h2>
          </div>
          <span v-if="loading" class="mt-1 size-5 animate-spin rounded-full border-2 border-blue-700 border-r-transparent" aria-hidden="true" />
        </div>
        <p v-if="!job && loading" class="mt-2 text-sm leading-5 text-slate-600">Subiendo el PDF y preparando el job.</p>
        <template v-if="job">
          <p class="mt-2 text-sm leading-5 text-slate-600">{{ jobDescription(job) }}</p>
          <div v-if="job.total_pages && mode === 'ocr'" class="mt-4 space-y-1">
            <progress
              class="h-2 w-full accent-blue-700"
              aria-label="Progreso del OCR"
              :max="job.total_pages"
              :value="job.pages_processed ?? 0"
            />
            <p class="text-sm text-slate-600">Páginas: {{ job.pages_processed ?? 0 }} de {{ job.total_pages }}</p>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
            <span class="text-xs font-medium text-slate-600">ID</span>
            <code class="min-w-0 flex-1 break-all text-xs text-slate-800">{{ job.job_id }}</code>
            <button
              type="button"
              class="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-700"
              @click="copyJobId"
            >
              {{ copied ? 'Copiado' : 'Copiar ID' }}
            </button>
          </div>

          <p v-if="job.status === 'error' || job.status === 'stopped'" class="mt-3 rounded-lg bg-red-50 p-3 text-sm leading-5 text-red-800" role="alert">
            {{ job.errors?.message || fallbackJobError(job.status) }}
          </p>
          <a
            v-if="job.status === 'done'"
            :href="getResultUrl(job.job_id, mode)"
            class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-green-700 px-5 py-3 text-base font-semibold text-white hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:w-auto"
          >
            {{ mode === 'ocr' ? 'Descargar texto (.txt)' : 'Descargar resultado (.json)' }}
          </a>
        </template>

        <p v-if="error" class="mt-3 rounded-lg bg-red-50 p-3 text-sm leading-5 text-red-800" role="alert">{{ error }}</p>
      </section>

      <details class="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm sm:px-6">
        <summary class="min-h-14 cursor-pointer py-4 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-700">
          Consultar un job anterior
        </summary>
        <div class="space-y-3 border-t border-slate-100 pb-4 pt-4">
          <label for="previous-job" class="block text-sm font-medium text-slate-800">ID del job de {{ mode === 'ocr' ? 'OCR' : 'interpretación' }}</label>
          <input
            id="previous-job"
            v-model="previousJobId"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="15"
            placeholder="15 caracteres"
            class="min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 disabled:bg-slate-100"
            :disabled="loading"
            @input="resumeError = ''"
          />
          <p class="text-xs leading-5 text-slate-500">Selecciona arriba el tipo de job correspondiente.</p>
          <p v-if="resumeError" class="text-sm text-red-700" role="alert">{{ resumeError }}</p>
          <button
            type="button"
            class="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            :disabled="loading || !previousJobId.trim()"
            @click="handleResume"
          >
            Consultar job
          </button>
        </div>
      </details>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getResultUrl, parseJsonSchema, type Job, type JobStatus, type Operation } from '@/api'
import { useDocumentJob } from '@/composables/useDocumentJob'
import DropZone from '@/components/DropZone.vue'

const MAX_SCHEMA_BYTES = 512 * 1024
const file = ref<File | null>(null)
const mode = ref<Operation>('ocr')
const schemaText = ref('')
const schemaError = ref('')
const previousJobId = ref('')
const resumeError = ref('')
const copied = ref(false)
const { job, loading, error, process, resume, clear } = useDocumentJob()

function setMode(next: Operation) {
  if (loading.value || mode.value === next) return
  mode.value = next
  copied.value = false
  schemaError.value = ''
  resumeError.value = ''

  previousJobId.value = ''
  clear()
}

function selectFile(selected: File) {
  file.value = selected
  copied.value = false

  previousJobId.value = ''
  clear()
}

function removeFile() {
  file.value = null

  previousJobId.value = ''
  clear()
}

function onSchemaInput() {
  schemaError.value = ''
  copied.value = false
  clear()
}

async function onSchemaFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const selected = input.files?.[0]
  input.value = ''
  if (!selected) return

  schemaText.value = ''
  schemaError.value = ''
  copied.value = false
  previousJobId.value = ''
  clear()
  if (selected.size > MAX_SCHEMA_BYTES) {
    schemaError.value = 'El schema supera el límite de 512 KB.'
    return
  }

  try {
    const schema = parseJsonSchema(await selected.text())
    schemaText.value = JSON.stringify(schema, null, 2)
  } catch (err) {
    schemaError.value = err instanceof Error ? err.message : 'No se pudo leer el JSON Schema.'
  }
}

async function handleSubmit() {
  if (!file.value || loading.value) return
  if (mode.value === 'interpret' && schemaError.value) return
  schemaError.value = ''
  let schema: unknown

  if (mode.value === 'interpret') {
    if (new TextEncoder().encode(schemaText.value).byteLength > MAX_SCHEMA_BYTES) {
      schemaError.value = 'El schema supera el límite de 512 KB.'
      return
    }
    try {
      schema = parseJsonSchema(schemaText.value)
    } catch (err) {
      schemaError.value = err instanceof Error ? err.message : 'El schema no es JSON válido.'
      return
    }
  }

  copied.value = false
  await process(file.value, mode.value, schema)
}

async function handleResume() {
  const jobId = previousJobId.value.trim()
  if (!/^[a-z0-9]{15}$/.test(jobId)) {
    resumeError.value = 'El ID debe tener 15 letras minúsculas o números.'
    return
  }
  resumeError.value = ''
  copied.value = false
  await resume(jobId, mode.value)
}

async function copyJobId() {
  if (!job.value) return
  try {
    await navigator.clipboard.writeText(job.value.job_id)
    copied.value = true
  } catch {
    copied.value = false
  }
}

function statusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    starting: 'Preparando',
    processing: 'En curso',
    done: 'Listo',
    error: 'Error',
    stopped: 'Interrumpido',
  }
  return labels[status]
}

function jobDescription(current: Job): string {
  if (current.status === 'starting') return 'Estamos iniciando el procesamiento.'
  if (current.status === 'processing' && mode.value === 'interpret' && current.phase === 'interpreting') {
    return 'El OCR terminó. El modelo está generando el JSON.'
  }
  if (current.status === 'processing') return 'Extrayendo texto del PDF.'
  if (current.status === 'done') return 'El fichero está listo para descargar.'
  if (current.status === 'stopped') return 'El job se interrumpió y no se reanudará automáticamente.'
  return 'El procesamiento no pudo completarse.'
}

function fallbackJobError(status: JobStatus): string {
  return status === 'stopped' ? 'El job se interrumpió.' : 'El job terminó con un error.'
}
</script>
