<template>
  <div
    class="rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:p-8"
    :class="dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      id="ocr-file"
      class="sr-only"
      type="file"
      accept=".pdf,application/pdf"
      @change="onInputChange"
    />
    <label for="ocr-file" class="cursor-pointer font-medium text-blue-700 hover:text-blue-800">
      Seleccionar PDF o arrastrarlo aquí
    </label>
    <p class="mt-2 text-sm text-slate-500">Un PDF de hasta 10 MB por operación.</p>

    <div v-if="props.file" class="mx-auto mt-5 flex max-w-lg items-center justify-between gap-4 rounded-lg bg-white p-3 text-left shadow-sm">
      <span class="min-w-0 truncate text-sm font-medium text-slate-800">{{ props.file.name }}</span>
      <button
        type="button"
        class="shrink-0 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
        @click="emit('remove')"
      >
        Quitar
      </button>
    </div>

    <p v-if="error" class="mt-3 text-sm text-red-600" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const props = defineProps<{ file: File | null }>()
const emit = defineEmits<{
  select: [file: File]
  remove: []
}>()

const dragging = ref(false)
const error = ref('')

function selectFile(file: File | undefined) {
  if (!file) return
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  if (!isPdf) {
    error.value = 'El OCR asíncrono admite archivos PDF.'
  } else if (file.size > MAX_FILE_SIZE) {
    error.value = 'El archivo supera el límite de 10 MB.'
  } else {
    error.value = ''
    emit('select', file)
  }
}

function onInputChange(event: Event) {
  const target = event.currentTarget as HTMLInputElement
  selectFile(target.files?.[0])
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (files && files.length > 1) {
    error.value = 'Selecciona un único archivo cada vez.'
    return
  }
  selectFile(files?.[0])
}
</script>
