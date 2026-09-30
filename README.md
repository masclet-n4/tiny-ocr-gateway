# ocr-front

Interfaz Vue 3 servida por Bun para procesar PDFs con el servicio OCR Python y descargar resultados desde RustFS.

## Estructura

- frontend/: interfaz Vue y configuración Vite.
- backend/: servidor Bun, proxy OCR y firma de descargas RustFS.
- dist/: build de frontend que Bun sirve en producción.

## Desarrollo

Copia .env.example a .env y configura RustFS. Asegúrate de que Python OCR responde en OCR_BASE_URL (por defecto puerto 3000). Instala dependencias con pnpm install y ejecuta en dos terminales:

- bun run dev:server
- bun run dev

Vite queda en el puerto 5174 y reenvía las rutas al servidor Bun en el 3001.

## Producción

- pnpm build
- bun run start


## Docker Compose

Copia .env.example a .env y configura las variables necesarias para este servicio.

- docker compose up --build -d
- docker compose logs -f ocr-front
- docker compose down

El puerto publicado por defecto es 3001; puedes cambiarlo definiendo OCR_FRONT_PORT en .env. Las credenciales se leen desde .env al arrancar y no se incluyen en la imagen.

Bun conserva las rutas Python /alive, /ocr/* y /jobs/* sin transformar sus respuestas. /download/:job_id consulta el job, firma un GET de RustFS con result_key y redirige a la URL temporal.

Variables: PORT, HOST, OCR_BASE_URL, RUSTFS_ENDPOINT, RUSTFS_BUCKET, RUSTFS_ACCESS_KEY, RUSTFS_SECRET_KEY, RUSTFS_REGION y RUSTFS_URL_EXPIRES_SECONDS. El endpoint presignado debe ser accesible por HTTPS desde el navegador.

Verificaciones: pnpm build y bun test. La prueba real con Python OCR y RustFS queda pendiente de configurar el entorno.
