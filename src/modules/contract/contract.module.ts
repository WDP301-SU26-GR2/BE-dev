import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { PdfModule } from 'src/infrastructure/pdf/pdf.module'
import { AuthModule } from '../auth/auth.module'
import { BoardModule } from '../board/board.module'
import { NotificationModule } from '../notification/notification.module'
import { PaymentModule } from '../payment/payment.module'
import { StorageModule } from '../storage/storage.module'
import { AssetRegistryService } from '../storage/services/asset-registry.service'
import { ContractTransferPort } from '../transfer/ports/contract-transfer.port'
import { ContractTransferAdapter } from './adapters/contract-transfer.adapter'
import { ContractAmendmentRepo } from './contract-amendment.repo'
import { ContractController } from './contract.controller'
import { ContractAmendmentController } from './contract-amendment.controller'
import { PaymentConditionController } from './payment-condition.controller'
import { ContractRepo } from './contract.repo'
import { ContractAmendmentListener } from './listeners/contract-amendment.listener'
import { ContractAmendmentService } from './services/contract-amendment.service'
import { ContractAmendmentDraftService } from './services/contract-amendment-draft.service'
import { ContractAmendmentQueryService } from './services/contract-amendment-query.service'
import { ContractAmendmentSigningService } from './services/contract-amendment-signing.service'
import { ContractDraftService } from './services/contract-draft.service'
import { ContractPdfService } from './services/contract-pdf.service'
import { ContractQueryService } from './services/contract-query.service'
import { ContractRevenueService } from './services/contract-revenue.service'
import { ContractSigningService } from './services/contract-signing.service'
import { ContractService } from './services/contract.service'
import { ContractWorkflowService } from './services/contract-workflow.service'
import { ContractAssetRegistryPort } from './ports/contract-asset-registry.port'

@Module({
  imports: [EventEmitterModule, AuthModule, BoardModule, NotificationModule, PaymentModule, StorageModule, PdfModule],
  controllers: [ContractController, PaymentConditionController, ContractAmendmentController],
  providers: [
    ContractService,
    ContractQueryService,
    ContractDraftService,
    ContractWorkflowService,
    ContractSigningService,
    ContractPdfService,
    ContractRevenueService,
    ContractRepo,
    ContractAmendmentService,
    ContractAmendmentQueryService,
    ContractAmendmentDraftService,
    ContractAmendmentSigningService,
    ContractAmendmentRepo,
    ContractAmendmentListener,
    { provide: ContractAssetRegistryPort, useExisting: AssetRegistryService },
    { provide: ContractTransferPort, useClass: ContractTransferAdapter }
  ],
  exports: [ContractService, ContractWorkflowService, ContractTransferPort]
})
export class ContractModule {}
