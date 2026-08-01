import { Injectable } from '@nestjs/common'
import { ContractStatus, ContractType, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NotificationService } from 'src/modules/notification/notification.service'
import { CONTRACT_CREATION_BLOCKING_STATUSES, CONTRACT_EDITABLE_STATUSES } from '../contract.constant'
import { ContractRepo } from '../contract.repo'
import { CreateContractBodyDto, EditorUpdateContractBodyDto } from '../dto/contract.dto'
import { ContractErrors } from '../errors/contract.errors'
import { ContractMessages } from '../contract.messages'
import { PaymentService } from 'src/modules/payment/services/payment.service'

@Injectable()
export class ContractDraftService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService,
    private readonly paymentService: PaymentService
  ) {}

  async createDraft(editorId: string, dto: CreateContractBodyDto) {
    if (!isObjectId(dto.seriesId) || !isObjectId(dto.boardDecisionId)) throw ContractErrors.NotFound()
    const [series, decision] = await Promise.all([
      this.contractRepo.findSeriesForContractCreation(dto.seriesId),
      this.contractRepo.findBoardDecisionForContractCreation(dto.boardDecisionId)
    ])
    if (!series) throw ContractErrors.NotFound()
    if (!decision) throw ContractErrors.ContractCreationBoardDecisionNotFound()
    if (series.status !== 'SERIALIZED') throw ContractErrors.SeriesNotSerialized()
    if (series.mangakaId !== dto.mangakaId) throw ContractErrors.ContractMangakaMismatch()
    if (
      decision.targetSeriesId !== dto.seriesId ||
      decision.decisionType !== 'SERIALIZATION' ||
      decision.result !== 'APPROVED'
    ) {
      throw ContractErrors.InvalidSerializationDecision()
    }
    const existing = await this.contractRepo.findBlockingContractForCreation(
      dto.seriesId,
      dto.boardDecisionId,
      CONTRACT_CREATION_BLOCKING_STATUSES
    )
    if (existing) throw ContractErrors.OpenContractExists()

    const contract = await this.contractRepo.createDraft(editorId, dto)
    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: editorId,
        type: NotificationType.CONTRACT,
        referenceId: contract.id,
        referenceType: 'CONTRACT_DRAFT_CREATED',
        content: ContractMessages.notification.contractDraftCreatedEditor
      }),
      this.notificationService.notifySafe({
        recipientId: dto.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: contract.id,
        referenceType: 'CONTRACT_DRAFT_CREATED',
        content: ContractMessages.notification.contractDraftCreatedMangaka
      })
    ])
    return contract
  }

  async editorUpdateContract(contractId: string, editorId: string, dto: EditorUpdateContractBodyDto, note?: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    if (!CONTRACT_EDITABLE_STATUSES.includes(contract.status)) throw ContractErrors.InvalidContractTransition()

    const merged = {
      contractType: dto.contractType ?? contract.contractType,
      valuationAmount: dto.valuationAmount ?? contract.valuationAmount,
      publisherOwnershipPct: dto.publisherOwnershipPct ?? contract.publisherOwnershipPct,
      mangakaOwnershipPct: dto.mangakaOwnershipPct ?? contract.mangakaOwnershipPct,
      contractStart: dto.contractStart ?? contract.contractStart,
      contractEnd: dto.contractEnd ?? contract.contractEnd
    }
    this.assertMoneyInvariant(merged)
    if (
      dto.contractType !== undefined ||
      dto.valuationAmount !== undefined ||
      dto.publisherOwnershipPct !== undefined ||
      dto.mangakaOwnershipPct !== undefined
    ) {
      await this.paymentService.assertExistingConditionsWithinNewCap(contractId, {
        contractType: merged.contractType,
        valuationAmount: merged.valuationAmount,
        publisherOwnershipPct: merged.publisherOwnershipPct
      })
    }

    const updated = await this.contractRepo.updateAndLogVersion(contractId, { ...dto }, editorId, note)
    await this.notificationService.notifySafe({
      recipientId: contract.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_UPDATED',
      content: ContractMessages.notification.contractUpdated
    })
    return updated
  }

  async redraft(sourceContractId: string, editorId: string) {
    if (!isObjectId(sourceContractId)) throw ContractErrors.NotFound()
    const source = await this.contractRepo.findById(sourceContractId)
    if (!source) throw ContractErrors.NotFound()
    if (source.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    if (source.status !== ContractStatus.REJECTED_BY_MANGAKA) throw ContractErrors.ContractRedraftNotAllowed()
    const created = await this.contractRepo.redraftClone(sourceContractId, editorId)
    if (!created) throw ContractErrors.NotFound()
    await this.notificationService.notifySafe({
      recipientId: source.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: created.id,
      referenceType: 'CONTRACT_DRAFT_CREATED',
      content: ContractMessages.notification.redrafted
    })
    return created
  }

  private assertMoneyInvariant(value: {
    contractType: ContractType
    valuationAmount: number | null
    publisherOwnershipPct: number | null
    mangakaOwnershipPct: number | null
    contractStart: Date | null
    contractEnd: Date | null
  }) {
    if (!value.valuationAmount || value.valuationAmount <= 0) throw ContractErrors.InvalidContractMoney()
    const publisher = value.publisherOwnershipPct ?? -1
    const mangaka = value.mangakaOwnershipPct ?? -1
    if (value.contractType === ContractType.FULL_BUYOUT) {
      if (publisher !== 100 || mangaka !== 0) throw ContractErrors.InvalidContractMoney()
    } else if (!(publisher > 0 && publisher < 100) || !(mangaka > 0 && mangaka < 100) || publisher + mangaka !== 100) {
      throw ContractErrors.InvalidContractMoney()
    }
    if (value.contractStart && value.contractEnd && value.contractEnd.getTime() <= value.contractStart.getTime()) {
      throw ContractErrors.InvalidContractMoney()
    }
  }
}
