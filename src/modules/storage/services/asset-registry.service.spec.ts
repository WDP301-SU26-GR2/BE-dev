import { AssetRegistryService } from './asset-registry.service'

describe('AssetRegistryService', () => {
  it('returns only asset ids found by the storage-owned repository', async () => {
    const repository = { findAssetsByIds: jest.fn().mockResolvedValue(['asset-1']) }
    const service = new AssetRegistryService(repository as never)

    await expect(service.findExistingAssetIds(['asset-1', 'missing'])).resolves.toEqual(['asset-1'])
    expect(repository.findAssetsByIds).toHaveBeenCalledWith(['asset-1', 'missing'])
  })

  it('registers a generated asset through the storage-owned repository', async () => {
    const asset = { id: 'asset-1' }
    const repository = { createAsset: jest.fn().mockResolvedValue(asset) }
    const service = new AssetRegistryService(repository as never)
    const command = {
      uploadedBy: 'editor-1',
      name: 'contract.pdf',
      filePath: 'contracts/contract.pdf',
      assetType: 'DOCUMENT' as const
    }

    await expect(service.registerGeneratedAsset(command)).resolves.toBe(asset)
    expect(repository.createAsset).toHaveBeenCalledWith(command)
  })
})
