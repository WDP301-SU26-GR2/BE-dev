import { Injectable } from '@nestjs/common'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import envConfig from 'src/core/config/envConfig'

export interface PresignedUpload {
  uploadUrl: string
  requiredHeaders: Record<string, string>
  expiresAt: string
}

export interface PresignedDownload {
  downloadUrl: string
  expiresAt: string
}

type StorageEnvConfig = typeof envConfig & {
  R2_ENDPOINT: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  R2_BUCKET: string
  R2_REGION: string
}

const storageEnvConfig = envConfig as StorageEnvConfig
const PRESIGN_EXPIRES_SECONDS = 600

@Injectable()
export class StorageService {
  private readonly client = new S3Client({
    region: storageEnvConfig.R2_REGION,
    endpoint: storageEnvConfig.R2_ENDPOINT,
    forcePathStyle: true,
    // AWS SDK v3 mặc định chèn CRC32 checksum (x-amz-checksum-crc32 + x-amz-sdk-checksum-algorithm)
    // vào presigned PUT — Cloudflare R2 không tương thích nên upload thật bị từ chối. Tắt đi.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: storageEnvConfig.R2_ACCESS_KEY_ID,
      secretAccessKey: storageEnvConfig.R2_SECRET_ACCESS_KEY
    }
  })

  async createPresignedUpload(input: {
    key: string
    contentType: string
    contentLength: number
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: storageEnvConfig.R2_BUCKET,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength
    })
    // Pin content-type vào chữ ký (signableHeaders) → FE PUT sai Content-Type sẽ bị R2 từ chối 403.
    // Content-Length đã được SDK đưa vào signed headers tự động (enforce đúng size).
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
      signableHeaders: new Set(['content-type'])
    })

    return {
      uploadUrl,
      // Chỉ Content-Type là header FE BẮT BUỘC tự set khi PUT. Content-Length do trình duyệt tự set
      // theo body (header bị cấm set tay) — không trả ở đây để khỏi gây hiểu nhầm contract.
      requiredHeaders: { 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString()
    }
  }

  async createPresignedDownload(key: string, expiresInSeconds = PRESIGN_EXPIRES_SECONDS): Promise<PresignedDownload> {
    const command = new GetObjectCommand({ Bucket: storageEnvConfig.R2_BUCKET, Key: key })
    const downloadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds })

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    }
  }

  // Spec 24: server-generated artifacts (for example contract PDFs) are uploaded directly by the backend.
  // User-originated files must continue to use createPresignedUpload.
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: storageEnvConfig.R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType
      })
    )
  }

  // Xoá object khỏi R2 (dùng khi xoá page → dọn file gốc/composite khỏi bucket).
  // R2/S3 DeleteObject là idempotent: xoá key không tồn tại vẫn trả 204, không ném.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: storageEnvConfig.R2_BUCKET, Key: key }))
  }

  async headObjectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: storageEnvConfig.R2_BUCKET, Key: key }))
      return true
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404 || status === 403) return false
      throw err
    }
  }
}
