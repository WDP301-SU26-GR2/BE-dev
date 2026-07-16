import { Module } from '@nestjs/common'
import { PublicController } from './public.controller'
import { PublicRepository } from './public.repo'
import { PublicService } from './public.service'

@Module({
  controllers: [PublicController],
  providers: [PublicService, PublicRepository]
})
export class PublicModule {}
