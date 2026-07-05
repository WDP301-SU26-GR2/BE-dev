import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ContractController } from './contract.controller'
import { ContractService } from './services/contract.service'
import { ContractRepo } from './contract.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AuthModule } from '../auth/auth.module'
import { NotificationModule } from '../notification/notification.module'
import { PaymentModule } from '../payment/payment.module'

@Module({
  imports: [EventEmitterModule, AuthModule, NotificationModule, PaymentModule],
  controllers: [ContractController],
  providers: [
    ContractService,
    ContractRepo,
    PrismaService // Đăng ký PrismaService để Repository có thể inject vào sử dụng
  ],
  exports: [ContractService] // Export nếu sau này module khác (như Notification) cần gọi tới
})
export class ContractModule {}
