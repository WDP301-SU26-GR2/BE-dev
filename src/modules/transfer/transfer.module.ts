import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BoardModule } from '../board/board.module'
import { ContractModule } from '../contract/contract.module'
import { PaymentModule } from '../payment/payment.module'
import { SeriesModule } from '../series/series.module'
import { TransferAccessPolicy } from './services/transfer-access.policy'
import { TransferContractStateService } from './services/transfer-contract-state.service'
import { TransferFinalizerService } from './services/transfer-finalizer.service'
import { TransferOutboxProcessor } from './services/transfer-outbox.processor'
import { TransferRequestStateService } from './services/transfer-request-state.service'
import { TransferService } from './services/transfer.service'
import { TransferContractQueryService } from './services/transfer-contract-query.service'
import { TransferContractService } from './services/transfer-contract.service'
import { TransferNegotiationService } from './services/transfer-negotiation.service'
import { TransferRequestService } from './services/transfer-request.service'
import { TransferResourceLoader } from './services/transfer-resource-loader.service'
import { TransferSigningService } from './services/transfer-signing.service'
import { TransferSettlementEffectsService } from './services/transfer-settlement-effects.service'
import { TransferTransactionService } from './services/transfer-transaction.service'
import { TransferController } from './transfer.controller'
import { TransferRepo } from './transfer.repo'

@Module({
  imports: [AuthModule, BoardModule, ContractModule, PaymentModule, SeriesModule],
  controllers: [TransferController],
  providers: [
    TransferService,
    TransferRequestService,
    TransferNegotiationService,
    TransferContractService,
    TransferContractQueryService,
    TransferSigningService,
    TransferResourceLoader,
    TransferTransactionService,
    TransferRepo,
    TransferAccessPolicy,
    TransferRequestStateService,
    TransferContractStateService,
    TransferFinalizerService,
    TransferSettlementEffectsService,
    TransferOutboxProcessor
  ],
  exports: [TransferService]
})
export class TransferModule {}
