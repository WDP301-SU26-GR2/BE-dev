import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import envConfig from 'src/core/config/envConfig'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { StorageService as ObjectStorageService } from 'src/infrastructure/storage/storage.service'
import { StorageRepository } from './storage.repo'

@Injectable()
export class OrphanAssetCron {
  private readonly logger = new Logger(OrphanAssetCron.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly storageRepository: StorageRepository,
    private readonly objectStorageService: ObjectStorageService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const locked = await this.redisService.setNxEx('cron:orphan-asset', 600)
    if (!locked) return

    const before = new Date(Date.now() - envConfig.ORPHAN_ASSET_TTL_HOURS * 3600 * 1000)
    const assets = await this.storageRepository.findStaleAssets(before)
    let removed = 0

    for (const asset of assets) {
      const exists = await this.objectStorageService.headObjectExists(asset.filePath)
      if (!exists) {
        await this.storageRepository.deleteAssetById(asset.id)
        removed++
      }
    }

    this.logger.log(`Orphan asset cron: scanned ${assets.length}, removed ${removed}`)
  }
}
