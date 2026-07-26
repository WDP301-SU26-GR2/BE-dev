import { Injectable } from '@nestjs/common'
import { CreateAmendmentBodyType, UpdateAmendmentBodyType } from '../schemas/contract-amendment-schema'
import { ContractAmendmentDraftService } from './contract-amendment-draft.service'
import { ContractAmendmentQueryService } from './contract-amendment-query.service'
import { ContractAmendmentSigningService } from './contract-amendment-signing.service'

@Injectable()
export class ContractAmendmentService {
  constructor(
    private readonly queryService: ContractAmendmentQueryService,
    private readonly draftService: ContractAmendmentDraftService,
    private readonly signingService: ContractAmendmentSigningService
  ) {}

  create(contractId: string, editorId: string, body: CreateAmendmentBodyType) {
    return this.draftService.create(contractId, editorId, body)
  }
  list(contractId: string, userId: string, roleName: string) {
    return this.queryService.list(contractId, userId, roleName)
  }
  detail(contractId: string, id: string, userId: string, roleName: string) {
    return this.queryService.detail(contractId, id, userId, roleName)
  }
  update(contractId: string, id: string, editorId: string, body: UpdateAmendmentBodyType) {
    return this.draftService.update(contractId, id, editorId, body)
  }
  submit(contractId: string, id: string, editorId: string) {
    return this.draftService.submit(contractId, id, editorId)
  }
  signMangaka(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    return this.signingService.signMangaka(contractId, id, userId, email, otpCode)
  }
  signBoard(contractId: string, id: string, userId: string, email: string, otpCode: string) {
    return this.signingService.signBoard(contractId, id, userId, email, otpCode)
  }
  reject(contractId: string, id: string, userId: string, reason: string) {
    return this.signingService.reject(contractId, id, userId, reason)
  }
  void(contractId: string, id: string, editorId: string, reason: string) {
    return this.draftService.void(contractId, id, editorId, reason)
  }
}
