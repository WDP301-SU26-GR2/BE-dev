import { Module } from '@nestjs/common'
import { ReprintRequestController } from './reprint-request.controller'
import { ReprintRequestService } from './services/reprint-request.service'
import { ReprintRequestRepo } from './reprint-request.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Module({
  controllers: [ReprintRequestController],
  providers: [ReprintRequestService, ReprintRequestRepo, PrismaService],
  exports: [ReprintRequestService]
})
export class ReprintRequestModule {}
