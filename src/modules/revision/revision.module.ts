import { Global, Module } from '@nestjs/common'
import { RevisionController } from './revision.controller'
import { RevisionRepository } from './revision.repo'
import { RevisionService } from './revision.service'

// Four production modules consume RevisionService.openSafe/currentRound. This module only depends on global
// Prisma/Notification providers, so making it global avoids repeated imports without creating a circular dependency.
@Global()
@Module({
  controllers: [RevisionController],
  providers: [RevisionService, RevisionRepository],
  exports: [RevisionService]
})
export class RevisionModule {}
