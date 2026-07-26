import { Injectable, Logger } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { BoardService } from 'src/modules/board/services/board.service'
import type { TransferDecisionContext } from 'src/modules/board/services/board.service'
import {
  InvalidTransferBoardDecisionException,
  TransferAccessDeniedException,
  TransferRequestNotFoundException
} from '../errors/transfer.error'
import { TransferRepo } from '../transfer.repo'
import type { ActorContext } from '../transfer.types'
import { TransferAccessPolicy } from './transfer-access.policy'

@Injectable()
export class TransferResourceLoader {
  private readonly logger = new Logger(TransferResourceLoader.name)

  constructor(
    private readonly repository: TransferRepo,
    private readonly boardService: BoardService,
    private readonly accessPolicy: TransferAccessPolicy
  ) {}

  async loadRequest(id: string) {
    if (!isObjectId(id)) throw TransferRequestNotFoundException
    const request = await this.repository.findTransferRequestById(id)
    if (!request) throw TransferRequestNotFoundException
    return request
  }

  async requestAccessResource(request: { seriesId: string; requestingMangakaId: string; originalMangakaId: string }) {
    const series = await this.repository.findSeriesAccessScope(request.seriesId)
    return {
      requestingMangakaId: request.requestingMangakaId,
      originalMangakaId: request.originalMangakaId,
      editorId: series?.editorId ?? null
    }
  }

  async resolveDecision(
    request: { seriesId: string },
    actor: ActorContext,
    reference: { boardDecisionId?: string; boardSessionId?: string },
    expectedResult: $Enums.BoardDecisionResult
  ): Promise<TransferDecisionContext> {
    let decision: TransferDecisionContext | null = null
    if (reference.boardDecisionId) {
      decision = await this.boardService.getTransferDecisionContext(reference.boardDecisionId)
    } else if (reference.boardSessionId) {
      this.logger.warn(`Deprecated boardSessionId compatibility path used for transfer series ${request.seriesId}`)
      const matches = await this.boardService.findTerminalTransferDecisionContextsBySession(
        reference.boardSessionId,
        request.seriesId
      )
      if (matches.length === 1) decision = matches[0]
    }

    if (!decision) throw InvalidTransferBoardDecisionException
    if (!this.accessPolicy.canBoardDecide(actor, decision.allowedEditorIds)) {
      throw TransferAccessDeniedException
    }
    if (
      decision.decisionType !== $Enums.DecisionType.TRANSFER ||
      decision.targetSeriesId !== request.seriesId ||
      decision.result !== expectedResult
    ) {
      throw InvalidTransferBoardDecisionException
    }
    return decision
  }

  async boardMemberIds(boardDecisionId?: string | null): Promise<string[]> {
    if (!boardDecisionId) return []
    const decision = await this.boardService.getTransferDecisionContext(boardDecisionId)
    return decision?.allowedEditorIds ?? []
  }
}
