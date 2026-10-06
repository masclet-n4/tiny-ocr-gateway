# ocr-front

Interfaz Vue 3 mobile-first servida por Bun para probar extracción de texto OCR e interpretación de PDFs con un JSON Schema. El gateway también ofrece la API genérica para otros servicios.

## Estructura

- frontend/: interfaz Vue y configuración Vite.
- `backend/`: servidor Bun, proxy OCR, coordinación de jobs y firma de URLs RustFS.
- dist/: build de frontend que Bun sirve en producción.

## Desarrollo

Copia .env.example a .env y configura RustFS. Asegúrate de que Python OCR responde en OCR_BASE_URL (por defecto puerto 3000). Instala dependencias con pnpm install y ejecuta en dos terminales:

- bun run dev:server
- bun run dev

Vite queda en el puerto 5174 y reenvía las rutas al servidor Bun en el 3001.


## Interfaz de pruebas

En la interfaz del gateway puedes elegir **Extraer texto** o **Obtener JSON**, subir un PDF y, para la segunda opción, pegar o cargar un archivo `.json` con el schema. La pantalla sigue el job, permite consultar jobs anteriores y ofrece la descarga del `.txt` o `.json` al terminar.

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


## API de interpretación

- `POST /interpret/async` (`multipart/form-data`): campos `file` (PDF) y `schema` (JSON Schema serializado). Devuelve `202 { "job_id": ... }`.
- `GET /interpret/jobs/:job_id`: estado/fase del flujo; al completar incluye `result_url`.
- `GET /interpret/jobs/:job_id/result`: redirige a una URL firmada para descargar el JSON desde RustFS.

El gateway coordina el job OCR, pasa al servicio `interpreter` una URL temporal firmada del texto, guarda el JSON validado en `RUSTFS_BUCKET/interpretations/:job_id.json` y actualiza el job de PocketBase. El servicio caller decide dónde persistir el resultado. Los jobs que estaban activos al arrancar el gateway se marcan `stopped`; no se reanudan.

Variables: `PORT`, `HOST`, `OCR_BASE_URL`, `INTERPRETER_BASE_URL`, `PB_URL`, `RUSTFS_ENDPOINT`, `RUSTFS_BUCKET`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `RUSTFS_REGION` y `RUSTFS_URL_EXPIRES_SECONDS`. La URL firmada debe ser accesible desde el interpretador y, para el JSON final, desde el servicio cliente.

Verificaciones locales: `pnpm build`, `bun test` y `cd ../interpreter && bun test`. La integración real con OCR, PocketBase, RustFS y OpenRouter requiere configurar esos servicios.
