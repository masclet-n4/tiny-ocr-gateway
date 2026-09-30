import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let s3Client: S3Client | undefined

export function getResultKey(job: unknown): string | null {
  if (!job || typeof job !== 'object') throw new Error('Respuesta de job no válida')
  const value = job as { status?: unknown; result_key?: unknown }

  if (value.status !== 'done') return null
  if (typeof value.result_key !== 'string' || value.result_key.length === 0) {
    throw new Error('El job terminado no contiene result_key')
  }

  return value.result_key
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client

  const endpoint = process.env.RUSTFS_ENDPOINT
  const accessKeyId = process.env.RUSTFS_ACCESS_KEY
  const secretAccessKey = process.env.RUSTFS_SECRET_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Falta configurar el endpoint o las credenciales de RustFS')
  }

  s3Client = new S3Client({
    endpoint,
    region: process.env.RUSTFS_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  return s3Client
}

export async function presignResult(key: string): Promise<string> {
  const bucket = process.env.RUSTFS_BUCKET
  if (!bucket) throw new Error('Falta configurar RUSTFS_BUCKET')
  const expiresIn = Number(process.env.RUSTFS_URL_EXPIRES_SECONDS ?? 300)
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 604800) {
    throw new Error('RUSTFS_URL_EXPIRES_SECONDS debe estar entre 1 y 604800')
  }

  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: 'text/plain; charset=utf-8',
      ResponseContentDisposition: 'attachment; filename="ocr-result.txt"',
    }),
    { expiresIn },
  )
}