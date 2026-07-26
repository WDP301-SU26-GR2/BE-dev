import type { Asset, AssetType } from '@prisma/client'

export type RegisterContractAssetCommand = {
  uploadedBy: string
  name: string
  filePath: string
  assetType: AssetType | null
}

export abstract class ContractAssetRegistryPort {
  abstract registerGeneratedAsset(command: RegisterContractAssetCommand): Promise<Asset>
}
