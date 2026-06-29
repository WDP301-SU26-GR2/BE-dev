import { Module } from '@nestjs/common'
import { StorageController } from './storage.controller'
import { StorageRepository } from './storage.repo'
import { StorageService } from './storage.service'
import { OrphanAssetCron } from './orphan-asset.cron'

@Module({
  controllers: [StorageController],
  providers: [StorageService, StorageRepository, OrphanAssetCron],
  exports: [StorageRepository]
})
export class StorageModule {}
