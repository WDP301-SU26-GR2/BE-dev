import { Module } from '@nestjs/common'
import { PaymentController } from './payment.controller'
import { PaymentService } from './services/payment.service'
import { PaymentEngineService } from './services/payment-engine.service'
import { PaymentListener } from './listeners/payment.listener'
import { PaymentRecordRepo } from './payment.repo'
import { PaymentConditionRepo } from './payment-condition.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PaymentEngineService, PaymentListener, PaymentRecordRepo, PaymentConditionRepo, PrismaService],
  exports: [
    PaymentService // Export để các module khác trong hệ thống có thể gọi trực tiếp hàm tạo payment ngầm
  ]
})
export class PaymentModule {}
