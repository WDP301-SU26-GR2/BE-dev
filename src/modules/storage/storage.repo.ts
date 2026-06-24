import { Injectable } from '@nestjs/common'
import { Asset, AssetType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class StorageRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createAsset(data: {
    uploadedBy: string
    name: string
    filePath: string
    assetType: AssetType | null
  }): Promise<Asset> {
    return await this.prismaService.asset.create({ data })
  }

  async findAssetByKey(key: string): Promise<Asset | null> {
    return await this.prismaService.asset.findFirst({ where: { filePath: key } })
  }
}
