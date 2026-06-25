import { Module } from '@nestjs/common'
import { AnnotationController } from './annotation.controller'
import { AnnotationRepository } from './annotation.repo'
import { AnnotationService } from './annotation.service'

@Module({
  controllers: [AnnotationController],
  providers: [AnnotationService, AnnotationRepository],
  exports: [AnnotationService] // A4 reuse
})
export class AnnotationModule {}
