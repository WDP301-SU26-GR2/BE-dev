import { Module } from '@nestjs/common'
import { AnnotationController } from './annotation.controller'
import { AnnotationRepository } from './annotation.repo'
import { AnnotationService } from './annotation.service'
import { AnnotationAccessService } from './services/annotation-access.service'

@Module({
  controllers: [AnnotationController],
  providers: [AnnotationService, AnnotationRepository, AnnotationAccessService],
  exports: [AnnotationService] // A4 reuse
})
export class AnnotationModule {}
