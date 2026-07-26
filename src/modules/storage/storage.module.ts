import { Module } from '@nestjs/common'
import { StorageController } from './storage.controller'
import { StorageRepository } from './storage.repo'
import { StorageService } from './storage.service'
import { OrphanAssetCron } from './orphan-asset.cron'
import { AssetRegistryService } from './services/asset-registry.service'
import { TaskAssetQueryPort } from 'src/modules/task/ports/task-asset-query.port'

@Module({
  controllers: [StorageController],
  providers: [
    StorageService,
    StorageRepository,
    AssetRegistryService,
    { provide: TaskAssetQueryPort, useExisting: AssetRegistryService },
    OrphanAssetCron
  ],
  exports: [AssetRegistryService, TaskAssetQueryPort]
})
export class StorageModule {}
