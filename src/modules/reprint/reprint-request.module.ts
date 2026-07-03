import { Module } from '@nestjs/common'
import { ReprintRequestController } from './reprint-request.controller'
import { ReprintRequestService } from './services/reprint-request.service'
import { ReprintRequestRepo } from './reprint-request.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  controllers: [ReprintRequestController],
  providers: [ReprintRequestService, ReprintRequestRepo, PrismaService],
  exports: [ReprintRequestService]
})
export class ReprintRequestModule {}
