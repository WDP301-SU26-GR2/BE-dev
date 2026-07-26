import { Injectable } from '@nestjs/common'
import type { Asset, AssetType } from '@prisma/client'
import { TaskAssetQueryPort } from 'src/modules/task/ports/task-asset-query.port'
import { StorageRepository } from '../storage.repo'

@Injectable()
export class AssetRegistryService implements TaskAssetQueryPort {
  constructor(private readonly repository: StorageRepository) {}

  findExistingAssetIds(ids: string[]) {
    return this.repository.findAssetsByIds(ids)
  }

  registerGeneratedAsset(command: {
    uploadedBy: string
    name: string
    filePath: string
    assetType: AssetType | null
  }): Promise<Asset> {
    return this.repository.createAsset(command)
  }
}
