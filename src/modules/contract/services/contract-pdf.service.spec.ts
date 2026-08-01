import { ContractStatus, ContractType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { ContractPdfService } from './contract-pdf.service'

describe('ContractPdfService', () => {
  const originalNodeEnv = envConfig.NODE_ENV

  afterEach(() => {
    envConfig.NODE_ENV = originalNodeEnv
    jest.restoreAllMocks()
  })

  function executedContract() {
    return {
      id: '507f1f77bcf86cd799439011',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 1000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'standard',
      contractStart: new Date('2026-08-01T00:00:00.000Z'),
      contractEnd: new Date('2027-08-01T00:00:00.000Z'),
      status: ContractStatus.FULLY_EXECUTED,
      mangakaSignedAt: new Date('2026-08-01T01:00:00.000Z'),
      representativeSignedAt: new Date('2026-08-01T02:00:00.000Z'),
      representativeId: 'board-1',
      representative: { displayName: 'Board Rep' },
      series: { id: 'series-1', title: 'Series One', magazine: null },
      mangaka: { displayName: 'Mangaka One' },
      editor: { displayName: 'Editor One' },
      boardDecision: null,
      conditions: [],
      versions: [{ id: 'v1' }],
      amendments: []
    }
  }

  function makeService(overrides: Partial<Record<string, unknown>> = {}) {
    const contractRepo = {
      findByIdForPdf: jest.fn().mockResolvedValue(executedContract())
    }
    const contractQueryService = { assertCanView: jest.fn() }
    const pdfRenderService = { renderContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-flowtest')) }
    const objectStorageService = {
      headObjectExists: jest.fn().mockResolvedValue(false),
      putObject: jest.fn().mockResolvedValue(undefined),
      createPresignedDownload: jest.fn().mockResolvedValue({
        downloadUrl: 'https://r2.example/contracts/test.pdf',
        expiresAt: '2026-08-01T00:10:00.000Z'
      })
    }
    const assetRegistry = { registerGeneratedAsset: jest.fn().mockResolvedValue(undefined) }

    const service = new ContractPdfService(
      (overrides.contractRepo ?? contractRepo) as never,
      (overrides.contractQueryService ?? contractQueryService) as never,
      (overrides.pdfRenderService ?? pdfRenderService) as never,
      (overrides.objectStorageService ?? objectStorageService) as never,
      (overrides.assetRegistry ?? assetRegistry) as never
    )

    return { service, contractRepo, contractQueryService, pdfRenderService, objectStorageService, assetRegistry }
  }

  it('falls back to an inline PDF download in test when object storage is unavailable', async () => {
    envConfig.NODE_ENV = 'test'
    const { service, objectStorageService, pdfRenderService } = makeService()
    objectStorageService.headObjectExists.mockRejectedValueOnce(new AggregateError([], 'network unavailable'))

    const result = await service.exportPdf('507f1f77bcf86cd799439011', 'editor-1', 'EDITOR')

    expect(result.key).toBe('contracts/507f1f77bcf86cd799439011/contract-v1-a0-t3.pdf')
    expect(result.downloadUrl).toMatch(/^data:application\/pdf;base64,/)
    expect(Buffer.from(result.downloadUrl.split(',')[1], 'base64').subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdfRenderService.renderContractPdf).toHaveBeenCalledTimes(1)
  })

  it('keeps object storage failures visible outside test', async () => {
    envConfig.NODE_ENV = 'development'
    const storageError = new AggregateError([], 'network unavailable')
    const { service, objectStorageService } = makeService()
    objectStorageService.headObjectExists.mockRejectedValueOnce(storageError)

    await expect(service.exportPdf('507f1f77bcf86cd799439011', 'editor-1', 'EDITOR')).rejects.toBe(storageError)
  })
})
