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

  async findStaleAssets(before: Date, limit = 100): Promise<Array<{ id: string; filePath: string }>> {
    return await this.prismaService.asset.findMany({
      where: { uploadedAt: { lt: before } },
      select: { id: true, filePath: true },
      take: limit
    })
  }

  async deleteAssetById(id: string): Promise<void> {
    await this.prismaService.asset.delete({ where: { id } })
  }
}
