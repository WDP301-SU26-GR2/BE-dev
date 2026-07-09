import { Module } from '@nestjs/common'
import { NameController } from './name.controller'
import { ChapterNameController } from './chapter-name.controller'
import { NameService } from './name.service'
import { NameRepo } from './name.repo'

@Module({
  controllers: [NameController, ChapterNameController],
  providers: [NameService, NameRepo],
  exports: [NameService, NameRepo]
})
export class NameModule {}
