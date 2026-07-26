import { Injectable } from '@nestjs/common'
import { ConditionType, ContractStatus, PaymentConditionStatus } from '@prisma/client'
import { transactionClient } from 'src/infrastructure/database/transaction-context'
import { ContractTransferPort } from 'src/modules/transfer/ports/contract-transfer.port'
import { ContractWorkflowService } from '../services/contract-workflow.service'

@Injectable()
export class ContractTransferAdapter implements ContractTransferPort {
  constructor(private readonly contractWorkflow: ContractWorkflowService) {}

  async createReplacementDraft(
    context: Parameters<ContractTransferPort['createReplacementDraft']>[0],
    command: Parameters<ContractTransferPort['createReplacementDraft']>[1]
  ) {
    return transactionClient(context).contract.create({
      data: {
        seriesId: command.seriesId,
        mangakaId: command.mangakaId,
        editorId: command.editorId,
        boardDecisionId: command.boardDecisionId,
        sourceTransferRequestId: command.sourceTransferRequestId,
        contractType: command.contractType,
        valuationAmount: command.valuationAmount,
        status: ContractStatus.DRAFT,
        conditions: {
          create: command.conditions.map((condition) => ({
            conditionType: condition.type as ConditionType,
            payoutAmount: condition.value,
            thresholdConfig: { description: condition.description },
            status: PaymentConditionStatus.PENDING
          }))
        }
      }
    })
  }

  async activateReplacementAndTerminateOriginal(
    context: Parameters<ContractTransferPort['activateReplacementAndTerminateOriginal']>[0],
    command: Parameters<ContractTransferPort['activateReplacementAndTerminateOriginal']>[1]
  ): Promise<void> {
    await this.contractWorkflow.activateReplacementAndTerminateOriginal(context, command)
  }
}
