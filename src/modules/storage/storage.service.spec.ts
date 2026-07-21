import { RoleName } from 'src/core/security/constants/role.constant'
import { StorageService } from './storage.service'

function make(assetByKey: unknown = null) {
  const storageInfra = {
    createPresignedUpload: jest.fn().mockResolvedValue({
      uploadUrl: 'https://r2/put',
      requiredHeaders: { 'Content-Type': 'image/png' },
      expiresAt: '2026-06-24T00:10:00.000Z'
    }),
    createPresignedDownload: jest.fn().mockResolvedValue({
      downloadUrl: 'https://r2/get',
      expiresAt: '2026-06-24T00:10:00.000Z'
    })
  }
  const repo = {
    createAsset: jest.fn().mockResolvedValue({ id: 'a1', filePath: 'uploads/u1/x.png' }),
    findAssetByKey: jest.fn().mockResolvedValue(assetByKey)
  }
  const appConfigService = { get: jest.fn().mockResolvedValue({ maxUploadBytes: 2048 }) }
  const service = new StorageService(storageInfra as never, repo as never, appConfigService as never)
  return { service, storageInfra, repo, appConfigService }
}

describe('StorageService.signUpload', () => {
  const body = { fileName: 'x.png', contentType: 'image/png' as const, contentLength: 1000 }

  it('creates Asset and returns presigned upload payload', async () => {
    const { service, repo, storageInfra } = make()

    const result = await service.signUpload('u1', body)

    expect(repo.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedBy: 'u1', name: 'x.png', assetType: null })
    )
    expect(storageInfra.createPresignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/png', contentLength: 1000 })
    )
    expect(result).toMatchObject({ assetId: 'a1', uploadUrl: 'https://r2/put' })
    expect(result.key).toContain('uploads/u1/')
  })

  it('strips path segments and unsafe filename characters from generated key', async () => {
    const { service, repo } = make()

    const result = await service.signUpload('u1', { ...body, fileName: '../weird name.png' })

    expect(result.key).toMatch(/^uploads\/u1\/.+-weird_name\.png$/)
    expect(repo.createAsset).toHaveBeenCalledWith(expect.objectContaining({ name: '../weird name.png' }))
  })

  it('rejects content length over the max', async () => {
    const { service } = make()

    await expect(service.signUpload('u1', { ...body, contentLength: 2049 })).rejects.toBeDefined()
  })

  it('rejects unsupported content type', async () => {
    const { service } = make()

    await expect(service.signUpload('u1', { ...body, contentType: 'application/zip' as never })).rejects.toBeDefined()
  })
})

describe('StorageService.signDownload', () => {
  it('throws when asset is not found', async () => {
    const { service } = make(null)

    await expect(service.signDownload({ userId: 'u1', roleName: RoleName.MANGAKA }, 'k')).rejects.toBeDefined()
  })

  it('allows the owner to download', async () => {
    const { service, storageInfra } = make({ id: 'a1', uploadedBy: 'u1', filePath: 'k' })

    const result = await service.signDownload({ userId: 'u1', roleName: RoleName.MANGAKA }, 'k')

    expect(storageInfra.createPresignedDownload).toHaveBeenCalledWith('k')
    expect(result.downloadUrl).toBe('https://r2/get')
  })

  it('allows editors to download other users assets', async () => {
    const { service, storageInfra } = make({ id: 'a1', uploadedBy: 'someone', filePath: 'k' })

    await service.signDownload({ userId: 'u1', roleName: RoleName.EDITOR }, 'k')

    expect(storageInfra.createPresignedDownload).toHaveBeenCalledWith('k')
  })

  it('allows a non-owner non-privileged user to download a non-DOCUMENT asset (e.g. avatar/cover)', async () => {
    const { service, storageInfra } = make({ id: 'a1', uploadedBy: 'someone', filePath: 'k', assetType: null })

    await service.signDownload({ userId: 'u1', roleName: RoleName.MANGAKA }, 'k')

    expect(storageInfra.createPresignedDownload).toHaveBeenCalledWith('k')
  })

  it('forbids non-owner non-privileged users from downloading a DOCUMENT asset (e.g. contract)', async () => {
    const { service } = make({ id: 'a1', uploadedBy: 'someone', filePath: 'k', assetType: 'DOCUMENT' })

    await expect(service.signDownload({ userId: 'u1', roleName: RoleName.MANGAKA }, 'k')).rejects.toBeDefined()
  })

  it('allows privileged roles to download a DOCUMENT asset of another user', async () => {
    const { service, storageInfra } = make({ id: 'a1', uploadedBy: 'someone', filePath: 'k', assetType: 'DOCUMENT' })

    await service.signDownload({ userId: 'u1', roleName: RoleName.EDITOR }, 'k')

    expect(storageInfra.createPresignedDownload).toHaveBeenCalledWith('k')
  })
})
