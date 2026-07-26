import { Injectable } from '@nestjs/common'
import { ContractStatus, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NotificationService } from 'src/modules/notification/notification.service'
import { CONTRACT_CREATION_BLOCKING_STATUSES, CONTRACT_EDITABLE_STATUSES } from '../contract.constant'
import { ContractRepo } from '../contract.repo'
import { CreateContractBodyDto, EditorUpdateContractBodyDto } from '../dto/contract.dto'
import { ContractErrors } from '../errors/contract.errors'
import { ContractMessages } from '../contract.messages'

@Injectable()
export class ContractDraftService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly notificationService: NotificationService
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

    const updated = await this.contractRepo.updateAndLogVersion(
      contractId,
      { ...dto, status: ContractStatus.NEGOTIATION, mangakaSignedAt: null, boardSignedAt: null },
      editorId,
      note
    )
    await this.notificationService.notifySafe({
      recipientId: contract.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_UPDATED',
      content: ContractMessages.notification.contractUpdated
    })
    return updated
  }
}
