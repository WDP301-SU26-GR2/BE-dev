const mockGetSignedUrl = jest.fn()

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => {
    const result = mockGetSignedUrl(...args) as Promise<string>
    return result
  }
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((input) => ({ input, send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input }))
}))

jest.mock('src/core/config/envConfig', () => ({
  __esModule: true,
  default: {
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: 'mangaka-dev',
    R2_REGION: 'auto'
  }
}))

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { StorageService } from './storage.service'

describe('StorageService', () => {
  beforeEach(() => {
    mockGetSignedUrl.mockReset()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('creates an R2-compatible S3 client with default checksums disabled', () => {
    new StorageService()

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        forcePathStyle: true,
        // R2 không tương thích với CRC32 checksum mặc định của AWS SDK v3 cho presigned PUT.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: expect.objectContaining({
          accessKeyId: expect.anything(),
          secretAccessKey: expect.anything()
        })
      })
    )
  })

  it('createPresignedUpload pins content-type into the signature and returns url + expiry', async () => {
    mockGetSignedUrl.mockResolvedValue('https://r2/put-signed')
    const service = new StorageService()

    const result = await service.createPresignedUpload({
      key: 'uploads/u1/x.png',
      contentType: 'image/png',
      contentLength: 1234
    })

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: 'uploads/u1/x.png',
        ContentType: 'image/png',
        ContentLength: 1234
      })
    )
    // content-type phải nằm trong signableHeaders → upload sai type bị R2 từ chối 403.
    const [, , presignOptions] = mockGetSignedUrl.mock.calls[0] as [
      unknown,
      unknown,
      { expiresIn: number; signableHeaders: Set<string> }
    ]
    expect(presignOptions.expiresIn).toBe(600)
    expect(presignOptions.signableHeaders).toBeInstanceOf(Set)
    expect(presignOptions.signableHeaders.has('content-type')).toBe(true)
    expect(result).toEqual({
      uploadUrl: 'https://r2/put-signed',
      // Content-Length KHÔNG trả trong requiredHeaders: trình duyệt cấm JS set tay (tự set theo body).
      requiredHeaders: { 'Content-Type': 'image/png' },
      expiresAt: expect.any(String)
    })
  })

  it('createPresignedDownload returns url and expiry', async () => {
    mockGetSignedUrl.mockResolvedValue('https://r2/get-signed')
    const service = new StorageService()

    const result = await service.createPresignedDownload('uploads/u1/x.png')

    expect(GetObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: 'uploads/u1/x.png' }))
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.anything() }),
      { expiresIn: 600 }
    )
    expect(result).toEqual({
      downloadUrl: 'https://r2/get-signed',
      expiresAt: expect.any(String)
    })
  })

  it('createPresignedDownload uses a caller-provided TTL for the signature and expiry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T00:00:00.000Z'))
    mockGetSignedUrl.mockResolvedValue('https://r2/get-signed')
    const service = new StorageService()

    const result = await service.createPresignedDownload('uploads/u1/x.png', 900)

    expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 900 })
    expect(result.expiresAt).toBe('2026-07-16T00:15:00.000Z')
  })

  it('putObject sends bucket, key, body and content type for a backend-generated PDF', async () => {
    const service = new StorageService()
    const client = (service as any).client
    const body = Buffer.from('%PDF-')

    await service.putObject('contracts/c1/contract-v1-a0.pdf', body, 'application/pdf')

    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'mangaka-dev',
          Key: 'contracts/c1/contract-v1-a0.pdf',
          Body: body,
          ContentType: 'application/pdf'
        })
      })
    )
  })
})
