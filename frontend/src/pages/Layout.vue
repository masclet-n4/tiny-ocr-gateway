<template>
  <main class="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header class="text-center">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">OCR de documentos</p>
        <h1 class="mt-2 text-4xl font-bold tracking-tight text-slate-900">Tiny OCR</h1>
        <p class="mt-3 text-slate-600">Extrae texto de un PDF en unos pasos.</p>
      </header>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 class="mb-4 text-lg font-semibold text-slate-900">Documento</h2>
        <DropZone :file="file" @select="selectFile" @remove="file = null" />
        <button
          type="button"
          :disabled="!file || loading"
          class="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="handleUpload"
        >
          {{ loading ? 'Procesando…' : 'Procesar PDF' }}
        </button>
      </section>

      <section v-if="job || error" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-live="polite">
        <h2 class="text-lg font-semibold text-slate-900">Resultado</h2>
        <div v-if="job" class="mt-4 space-y-2 text-sm text-slate-700">
          <p>Estado: <strong>{{ job.status }}</strong></p>
          <template v-if="job.total_pages">
            <progress aria-label="Progreso del OCR" class="h-2 w-full accent-blue-600" :max="job.total_pages" :value="job.pages_processed ?? 0">
              {{ job.pages_processed ?? 0 }} / {{ job.total_pages }}
            </progress>
            <p>Páginas: {{ job.pages_processed ?? 0 }} / {{ job.total_pages }}</p>
          </template>
          <p v-if="job.status === 'done'" class="font-medium text-green-700">Procesamiento completado.</p>
          <a
            v-if="job.status === 'done' && job.result_key"
            :href="getResultUrl(job.job_id)"
            class="inline-flex rounded-lg bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800"
          >
            Descargar texto OCR
          </a>
        </div>
        <p v-if="error" class="mt-4 text-sm text-red-600" role="alert">{{ error }}</p>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getResultUrl } from '@/api'
import { useOcr } from '@/composables/useOcr'
import DropZone from '@/components/DropZone.vue'

const file = ref<File | null>(null)
const { job, loading, error, upload } = useOcr()

function selectFile(selected: File) {
  file.value = selected
}

async function handleUpload() {
  if (file.value) await upload(file.value)
}
</script>
