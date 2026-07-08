import { Module } from '@nestjs/common'
import { ReprintRequestController } from './reprint-request.controller'
import { ReprintRequestService } from './services/reprint-request.service'
import { ReprintRequestStateService } from './services/reprint-request-state.service'
import { ReprintRequestRepo } from './reprint-request.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { NotificationModule } from '../notification/notification.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [NotificationModule, AuditModule],
  controllers: [ReprintRequestController],
  providers: [ReprintRequestService, ReprintRequestStateService, ReprintRequestRepo, PrismaService],
  exports: [ReprintRequestService]
})
export class ReprintRequestModule {}
