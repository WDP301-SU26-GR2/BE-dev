import { Module } from '@nestjs/common'
import { PaymentTransferPort } from '../transfer/ports/payment-transfer.port'
import { PaymentTransferAdapter } from './adapters/payment-transfer.adapter'
import { PaymentConditionRepo } from './payment-condition.repo'
import { PaymentController } from './payment.controller'
import { PaymentRecordRepo } from './payment.repo'
import { PaymentListener } from './listeners/payment.listener'
import { PaymentEngineService } from './services/payment-engine.service'
import { PaymentConditionService } from './services/payment-condition.service'
import { PaymentConditionStateService } from './services/payment-condition-state.service'
import { PaymentConditionTriggerService } from './services/payment-condition-trigger.service'
import { PaymentQueryService } from './services/payment-query.service'
import { PaymentScheduleTriggerService } from './services/payment-schedule-trigger.service'
import { PaymentService } from './services/payment.service'
import { PaymentStateService } from './services/payment-state.service'
import { PaymentTriggerService } from './services/payment-trigger.service'

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentQueryService,
    PaymentStateService,
    PaymentConditionService,
    PaymentConditionStateService,
    PaymentConditionTriggerService,
    PaymentScheduleTriggerService,
    PaymentTriggerService,
    PaymentEngineService,
    PaymentListener,
    PaymentRecordRepo,
    PaymentConditionRepo,
    { provide: PaymentTransferPort, useClass: PaymentTransferAdapter }
  ],
  exports: [PaymentService, PaymentTransferPort]
})
export class PaymentModule {}
