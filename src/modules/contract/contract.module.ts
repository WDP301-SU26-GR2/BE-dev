import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ContractController } from './contract.controller'
import { ContractService } from './services/contract.service'
import { ContractRepo } from './contract.repo'
import { ContractAmendmentService } from './services/contract-amendment.service'
import { ContractAmendmentRepo } from './contract-amendment.repo'
import { ContractAmendmentListener } from './listeners/contract-amendment.listener'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AuthModule } from '../auth/auth.module'
import { NotificationModule } from '../notification/notification.module'
import { PaymentModule } from '../payment/payment.module'
import { StorageModule } from '../storage/storage.module'
import { PdfModule } from 'src/infrastructure/pdf/pdf.module'

@Module({
  imports: [EventEmitterModule, AuthModule, NotificationModule, PaymentModule, StorageModule, PdfModule],
  controllers: [ContractController],
  providers: [
    ContractService,
    ContractRepo,
    ContractAmendmentService,
    ContractAmendmentRepo,
    ContractAmendmentListener,
    PrismaService
  ],
  exports: [ContractService] // Export nếu sau này module khác (như Notification) cần gọi tới
})
export class ContractModule {}
