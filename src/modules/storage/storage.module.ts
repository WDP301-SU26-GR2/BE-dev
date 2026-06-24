import { Module } from '@nestjs/common'
import { StorageController } from './storage.controller'
import { StorageRepository } from './storage.repo'
import { StorageService } from './storage.service'

@Module({
  controllers: [StorageController],
  providers: [StorageService, StorageRepository]
})
export class StorageModule {}
