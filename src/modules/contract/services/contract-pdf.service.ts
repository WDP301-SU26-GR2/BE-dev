import { Injectable } from '@nestjs/common'
import { AssetType, ContractAmendmentStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { PdfRenderService, type ContractPdfData } from 'src/infrastructure/pdf/pdf-render.service'
import { StorageService as ObjectStorageService } from 'src/infrastructure/storage/storage.service'
import { PDF_EXPORTABLE_STATUSES } from '../contract.constant'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { ContractAssetRegistryPort } from '../ports/contract-asset-registry.port'
import { ContractQueryService } from './contract-query.service'

@Injectable()
export class ContractPdfService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly contractQueryService: ContractQueryService,
    private readonly pdfRenderService: PdfRenderService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly assetRegistry: ContractAssetRegistryPort
  ) {}

  async exportPdf(contractId: string, userId: string, roleName: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findByIdForPdf(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.contractQueryService.assertCanView(contract, userId, roleName)
    if (!PDF_EXPORTABLE_STATUSES.includes(contract.status)) throw ContractErrors.ContractNotExecutedForPdf()

    const executedAmendments = contract.amendments.filter(
      (amendment) => amendment.status === ContractAmendmentStatus.FULLY_EXECUTED
    )
    const key = `contracts/${contract.id}/contract-v${contract.versions.length}-a${executedAmendments.length}.pdf`
    if (!(await this.objectStorageService.headObjectExists(key))) {
      const pdf = await this.pdfRenderService.renderContractPdf(this.toContractPdfData(contract, executedAmendments))
      await this.objectStorageService.putObject(key, pdf, 'application/pdf')
      await this.assetRegistry.registerGeneratedAsset({
        uploadedBy: userId,
        name: `contract-${contract.id}-v${contract.versions.length}.pdf`,
        filePath: key,
        assetType: AssetType.DOCUMENT
      })
    }
    return { ...(await this.objectStorageService.createPresignedDownload(key)), key }
  }

  private toContractPdfData(
    contract: Awaited<ReturnType<ContractRepo['findByIdForPdf']>> & {},
    executedAmendments: Array<{ fullyExecutedAt: Date | null }>
  ): ContractPdfData {
    const toIso = (value: Date | null) => value?.toISOString() ?? null
    return {
      id: contract.id,
      createdAt: contract.createdAt.toISOString(),
      contractType: contract.contractType,
      valuationAmount: contract.valuationAmount,
      publisherOwnershipPct: contract.publisherOwnershipPct,
      mangakaOwnershipPct: contract.mangakaOwnershipPct,
      terminationClause: contract.terminationClause,
      contractStart: toIso(contract.contractStart),
      contractEnd: toIso(contract.contractEnd),
      status: contract.status,
      mangakaSignedAt: toIso(contract.mangakaSignedAt),
      boardSignedAt: toIso(contract.boardSignedAt),
      series: contract.series,
      mangaka: { displayName: contract.mangaka.displayName },
      editor: contract.editor ? { displayName: contract.editor.displayName } : null,
      boardDecision: contract.boardDecision
        ? {
            decisionType: contract.boardDecision.decisionType,
            result: contract.boardDecision.result,
            decidedAt: toIso(contract.boardDecision.decidedAt),
            boardSession: {
              title: contract.boardDecision.boardSession.title,
              startTime: contract.boardDecision.boardSession.startTime.toISOString()
            }
          }
        : null,
      conditions: contract.conditions.map((condition) => ({
        conditionType: condition.conditionType,
        thresholdConfig: condition.thresholdConfig,
        payoutAmount: condition.payoutAmount,
        payoutPct: condition.payoutPct,
        status: condition.status
      })),
      signatures: contract.contractSignatures
        .filter((signature) => signature.role === 'BOARD_EDITOR')
        .map((signature) => ({
          displayName: signature.user?.displayName ?? signature.userId,
          signedAt: signature.signedAt.toISOString()
        })),
      versionCount: contract.versions.length,
      executedAmendmentCount: executedAmendments.length,
      latestAmendmentAt:
        executedAmendments
          .reduce<Date | null>(
            (latest, amendment) =>
              !amendment.fullyExecutedAt || (latest && latest >= amendment.fullyExecutedAt)
                ? latest
                : amendment.fullyExecutedAt,
            null
          )
          ?.toISOString() ?? null
    }
  }
}
