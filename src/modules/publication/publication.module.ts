import { Module } from '@nestjs/common'
import { PublicationController } from './publication.controller'
import { PublicationService } from './publication.service'
import { PublicationRepo } from './publication.repo'

@Module({
  controllers: [PublicationController],
  providers: [PublicationService, PublicationRepo]
})
export class PublicationModule {}
