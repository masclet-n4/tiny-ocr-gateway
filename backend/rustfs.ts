import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let s3Client: { endpoint: string; accessKeyId: string; secretAccessKey: string; region: string; client: S3Client } | undefined

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
  const endpoint = process.env.RUSTFS_ENDPOINT
  const accessKeyId = process.env.RUSTFS_ACCESS_KEY
  const secretAccessKey = process.env.RUSTFS_SECRET_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Falta configurar el endpoint o las credenciales de RustFS')
  }

  const region = process.env.RUSTFS_REGION ?? 'us-east-1'
  if (s3Client?.endpoint === endpoint && s3Client.accessKeyId === accessKeyId
    && s3Client.secretAccessKey === secretAccessKey && s3Client.region === region) {
    return s3Client.client
  }

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  s3Client = { endpoint, accessKeyId, secretAccessKey, region, client }
  return client
}

async function presignObject(key: string, contentType: string, filename: string): Promise<string> {
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
      ResponseContentType: contentType,
      ResponseContentDisposition: 'attachment; filename="' + filename + '"',
    }),
    { expiresIn },
  )
}

export function presignResult(key: string): Promise<string> {
  return presignObject(key, 'text/plain; charset=utf-8', 'ocr-result.txt')
}

export function presignJsonResult(key: string): Promise<string> {
  return presignObject(key, 'application/json; charset=utf-8', 'interpretation.json')
}

export async function saveInterpretationResult(jobId: string, result: unknown): Promise<string> {
  const bucket = process.env.RUSTFS_BUCKET
  if (!bucket) throw new Error('Falta configurar RUSTFS_BUCKET')
  const key = 'interpretations/' + jobId + '.json'
  const body = JSON.stringify(result)
  if (body === undefined) throw new Error('El resultado no se puede serializar a JSON')

  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
  }))
  return key
}