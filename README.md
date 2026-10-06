# tiny-ocr-gateway

Gateway Bun con interfaz Vue para extraer texto OCR e interpretar PDFs mediante un JSON Schema. Coordina `tiny-ocr` y `ai-interpreter`, consulta PocketBase y genera URLs firmadas de RustFS para descargar resultados.

## Requisitos

- Bun 1.3.14 o compatible.
- Node.js y pnpm para instalar dependencias y compilar el frontend (la imagen usa Node 22 y pnpm 12).
- Los servicios PocketBase y RustFS; para las funciones OCR e interpretación, también `tiny-ocr` y `ai-interpreter`.
- Credenciales válidas de RustFS y el bucket configurado ya creado.

## Configuración

Crea `.env` desde el ejemplo. Bun carga las variables para el servidor automáticamente:

```sh
cp .env.example .env
```

| Variable | Valor en `.env.example` / defecto | Uso |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP del servidor; Compose también lo fija en `3001`. |
| `HOST` | `0.0.0.0` | Interfaz de red donde escucha el servidor. |
| `OCR_FRONT_PORT` | `3001` | Puerto del host publicado por Compose. |
| `OCR_BASE_URL` | `http://localhost:3000` | URL base de `tiny-ocr`. |
| `INTERPRETER_BASE_URL` | `http://localhost:3002` | URL base de `ai-interpreter`. |
| `PB_URL` | `http://localhost:8090` | PocketBase para el estado de los jobs. |
| `RUSTFS_ENDPOINT` | `http://localhost:9000` | Endpoint S3 de RustFS; obligatorio para firmar descargas. |
| `RUSTFS_BUCKET` | `ocr-results` | Bucket de resultados; debe existir. |
| `RUSTFS_ACCESS_KEY` | `change-me` | Credencial de RustFS; reemplázala. |
| `RUSTFS_SECRET_KEY` | `change-me` | Secreto de RustFS; reemplázalo. |
| `RUSTFS_REGION` | `us-east-1` | Región S3. |
| `RUSTFS_URL_EXPIRES_SECONDS` | `300` | Vigencia de las URLs firmadas, de 1 a 604800 segundos. |

Si ejecutas el servicio en Docker junto con el workspace, usa las direcciones internas configuradas en el `compose.yaml` raíz. `RUSTFS_ENDPOINT` debe ser accesible también desde quien descarga la URL firmada.

## Ejecución en desarrollo

Desde este directorio, instala dependencias:

```sh
pnpm install
```

Arranca el servidor Bun y Vite en dos terminales:

```sh
bun run dev:server
pnpm dev
```

La interfaz queda en <http://localhost:5174> y reenvía las rutas al servidor en el puerto 3001.

## Ejecución con Docker

El Compose de este repositorio levanta solo el gateway; los otros servicios deben estar disponibles en las URLs configuradas:

```sh
docker compose up --build -d
docker compose logs -f ocr-front
docker compose down
```

El workspace completo se levanta desde el directorio raíz con `docker compose up --build -d`.

## Interfaz y API

La interfaz permite subir un PDF para **Extraer texto** o **Obtener JSON**. Para obtener JSON, proporciona un JSON Schema. La pantalla sigue el job y permite descargar el resultado cuando termina.

- `GET /alive`, `/ocr/*` y `/jobs/*` — se reenvían al servicio OCR.
- `GET /download/{job_id}` — redirige a una URL firmada para descargar el texto OCR.
- `POST /interpret/async` — recibe `file` (PDF) y `schema` (JSON Schema serializado); devuelve `202 { "job_id": ... }`.
- `GET /interpret/jobs/{job_id}` — consulta estado y fase; al terminar incluye `result_url`.
- `GET /interpret/jobs/{job_id}/result` — redirige a la descarga del JSON desde RustFS.

El estado de los jobs se guarda en PocketBase; el JSON de interpretación se guarda en `interpretations/` dentro del bucket. Los jobs de interpretación que estaban activos cuando arranca el gateway se marcan como `stopped`; no se reanudan.

## Pruebas

```sh
pnpm build
bun test
```

La integración completa requiere PocketBase, RustFS, `tiny-ocr` y `ai-interpreter` en ejecución.
