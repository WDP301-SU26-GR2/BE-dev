import { Injectable } from '@nestjs/common'
import { ContractStatus } from '@prisma/client'
import { CreateContractBodyDto, EditorUpdateContractBodyDto, ReportRevenueBodyDto } from '../dto/contract.dto'
import { ContractDraftService } from './contract-draft.service'
import { ContractPdfService } from './contract-pdf.service'
import { ContractQueryService } from './contract-query.service'
import { ContractRevenueService } from './contract-revenue.service'
import { ContractSigningService } from './contract-signing.service'
import { ContractWorkflowService } from './contract-workflow.service'

/**
 * Compatibility facade for controllers and cross-module callers.
 *
 * Business rules live in focused application services; keeping this class thin
 * preserves the existing public API while enforcing the service-boundary limit.
 */
@Injectable()
export class ContractService {
  constructor(
    private readonly queryService: ContractQueryService,
    private readonly draftService: ContractDraftService,
    private readonly workflowService: ContractWorkflowService,
    private readonly signingService: ContractSigningService,
    private readonly pdfService: ContractPdfService,
    private readonly revenueService: ContractRevenueService
  ) {}

  healthCheck() {
    return this.queryService.healthCheck()
  }

  getContracts(userId: string, roleName: string) {
    return this.queryService.getContracts(userId, roleName)
  }

  getContractById(contractId: string, userId: string, roleName: string) {
    return this.queryService.getContractById(contractId, userId, roleName)
  }

  getContractVersions(contractId: string, userId: string, roleName: string) {
    return this.queryService.getContractVersions(contractId, userId, roleName)
  }

  getContractVersionById(contractId: string, versionId: string, userId: string, roleName: string) {
    return this.queryService.getContractVersionById(contractId, versionId, userId, roleName)
  }

  exportPdf(contractId: string, userId: string, roleName: string) {
    return this.pdfService.exportPdf(contractId, userId, roleName)
  }

  createDraft(editorId: string, dto: CreateContractBodyDto) {
    return this.draftService.createDraft(editorId, dto)
  }

  updateStatusByWorkflow(contractId: string, userId: string, status: ContractStatus) {
    return this.workflowService.updateStatusByWorkflow(contractId, userId, status)
  }

  sendToMangaka(contractId: string, editorId: string) {
    return this.workflowService.sendToMangaka(contractId, editorId)
  }

  editorUpdateContract(contractId: string, editorId: string, dto: EditorUpdateContractBodyDto, note?: string) {
    return this.draftService.editorUpdateContract(contractId, editorId, dto, note)
  }

  mangakaApprove(contractId: string, userId: string) {
    return this.workflowService.mangakaApprove(contractId, userId)
  }

  mangakaRequestChanges(contractId: string, userId: string, reason: string) {
    return this.workflowService.mangakaRequestChanges(contractId, userId, reason)
  }

  boardApprove(contractId: string, userId: string, boardDecisionId: string) {
    return this.workflowService.boardApprove(contractId, userId, boardDecisionId)
  }

  boardRequestChanges(contractId: string, userId: string, boardDecisionId: string, reason: string) {
    return this.workflowService.boardRequestChanges(contractId, userId, boardDecisionId, reason)
  }

  signByMangakaWithOtp(contractId: string, userId: string, email: string, otpCode: string) {
    return this.signingService.signByMangakaWithOtp(contractId, userId, email, otpCode)
  }

  signByBoardWithOtp(contractId: string, userId: string, email: string, otpCode: string) {
    return this.signingService.signByBoardWithOtp(contractId, userId, email, otpCode)
  }

  checkContractStatus(contractId: string, userId: string, roleName: string) {
    return this.signingService.checkContractStatus(contractId, userId, roleName)
  }

  reportRevenue(contractId: string, userId: string, roleName: string, body: ReportRevenueBodyDto) {
    return this.revenueService.reportRevenue(contractId, userId, roleName, body)
  }
}
