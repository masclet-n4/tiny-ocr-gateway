<template>
  <div
    class="rounded-xl border-2 border-dashed p-5 transition-colors sm:p-6"
    :class="dragging ? 'border-blue-500 bg-blue-50' : props.disabled ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      id="pdf-input"
      class="peer sr-only"
      type="file"
      accept=".pdf,application/pdf"
      :disabled="props.disabled"
      @change="onInputChange"
    />
    <label
      for="pdf-input"
      class="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-base font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-700 sm:w-auto"
      :class="props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
    >
      Seleccionar PDF
    </label>
    <p class="mt-3 text-center text-sm text-slate-600 sm:text-left">PDF de hasta 10 MB. También puedes arrastrarlo aquí.</p>

    <div v-if="props.file" class="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <span class="min-w-0 truncate text-sm font-medium text-slate-800">{{ props.file.name }}</span>
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="props.disabled"
        @click="emit('remove')"
      >
        Quitar
      </button>
    </div>

    <p v-if="error" class="mt-3 text-sm text-red-700" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const props = defineProps<{ file: File | null; disabled?: boolean }>()
const emit = defineEmits<{
  select: [file: File]
  remove: []
}>()

const dragging = ref(false)
const error = ref('')

function selectFile(file: File | undefined) {
  if (!file || props.disabled) return
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  if (!isPdf) {
    error.value = 'Selecciona un archivo PDF.'

    emit('remove')
  } else if (file.size > MAX_FILE_SIZE) {
    error.value = 'El archivo supera el límite de 10 MB.'

    emit('remove')
  } else {
    error.value = ''
    emit('select', file)
  }
}

function onDragOver() {
  if (!props.disabled) dragging.value = true
}

function onInputChange(event: Event) {
  const target = event.currentTarget as HTMLInputElement
  selectFile(target.files?.[0])
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (props.disabled) return
  const files = event.dataTransfer?.files
  if (files && files.length > 1) {
    error.value = 'Selecciona un único archivo cada vez.'

    emit('remove')
    return
  }
  selectFile(files?.[0])
}
</script>
