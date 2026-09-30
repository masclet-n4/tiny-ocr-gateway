import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: frontendRoot,
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/alive': 'http://localhost:3001',
      '/ocr': 'http://localhost:3001',
      '/jobs': 'http://localhost:3001',
      '/download': 'http://localhost:3001',
    },
  },
})
