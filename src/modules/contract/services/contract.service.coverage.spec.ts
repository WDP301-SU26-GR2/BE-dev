jest.mock('src/infrastructure/pdf/pdf-render.service', () => ({
  PdfRenderService: class PdfRenderService {}
}))

import { ContractStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ContractService } from './contract.service'
import { ContractDraftService } from './contract-draft.service'
import { ContractPdfService } from './contract-pdf.service'
import { ContractQueryService } from './contract-query.service'
import { ContractRevenueService } from './contract-revenue.service'
import { ContractSigningService } from './contract-signing.service'
import { ContractWorkflowService } from './contract-workflow.service'

const CID = '507f1f77bcf86cd799439099'
const VID = '507f191e810c19729de860ea'

function setup() {
  const repo = {
    findManyByViewer: jest.fn(),
    findById: jest.fn(),
    findVersionsByContractId: jest.fn(),
    findVersionById: jest.fn(),
    findByIdForPdf: jest.fn(),
    updateStatus: jest.fn(),
    updateAndLogVersion: jest.fn(),
    findWithBoardDecision: jest.fn(),
    findSpecificSignature: jest.fn(),
    recordMangakaSignatureAndSettle: jest.fn(),
    recordBoardSignatureAndSettle: jest.fn(),
    getContractSignaturesProgress: jest.fn()
  }
  const otp = { validateOtpCode: jest.fn().mockResolvedValue(undefined) }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const events = { emit: jest.fn() }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const pdf = { renderContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) }
  const storage = {
    headObjectExists: jest.fn().mockResolvedValue(false),
    putObject: jest.fn(),
    createPresignedDownload: jest.fn().mockResolvedValue({ downloadUrl: 'signed', expiresAt: 'later' })
  }
  const assets = { registerGeneratedAsset: jest.fn() }
  const query = new ContractQueryService(repo as never)
  const draft = new ContractDraftService(repo as never, notification as never)
  const workflow = new ContractWorkflowService(repo as never, notification as never, audit as never)
  const signing = new ContractSigningService(
    repo as never,
    otp as never,
    notification as never,
    events as never,
    audit as never
  )
  const pdfService = new ContractPdfService(repo as never, query, pdf, storage as never, assets)
  const revenue = new ContractRevenueService(repo as never, events as never, audit as never)
  const service = new ContractService(query, draft, workflow, signing, pdfService, revenue)
  return { service, workflow, repo, otp, notification, events, audit, pdf, storage, assets }
}

describe('ContractService query and document policy', () => {
  it('returns health, viewer-scoped lists and authorized version resources', async () => {
    const { service, repo } = setup()
    const contract = { id: CID, editorId: 'editor', mangakaId: 'mangaka' }
    repo.findManyByViewer.mockResolvedValue([contract])
    repo.findById.mockResolvedValue(contract)
    repo.findVersionsByContractId.mockResolvedValue([{ id: VID }])
    repo.findVersionById.mockResolvedValue({ id: VID })

    expect(service.healthCheck()).toEqual({ status: 'OK', module: 'Contract' })
    await expect(service.getContracts('editor', RoleName.EDITOR)).resolves.toEqual([contract])
    await expect(service.getContractById(CID, 'editor', RoleName.EDITOR)).resolves.toBe(contract)
    await expect(service.getContractById(CID, 'mangaka', RoleName.MANGAKA)).resolves.toBe(contract)
    await expect(service.getContractById(CID, 'board', RoleName.BOARD_MEMBER)).resolves.toBe(contract)
    await expect(service.getContractVersions(CID, 'editor', RoleName.EDITOR)).resolves.toEqual([{ id: VID }])
    await expect(service.getContractVersionById(CID, VID, 'editor', RoleName.EDITOR)).resolves.toEqual({ id: VID })
  })

  it('hides missing, unauthorized and missing-version resources', async () => {
    const { service, repo } = setup()
    repo.findById.mockResolvedValueOnce(null)
    await expect(service.getContractById(CID, 'u1', RoleName.EDITOR)).rejects.toMatchObject({ status: 404 })

    repo.findById.mockResolvedValue({ id: CID, editorId: 'editor', mangakaId: 'mangaka' })
    await expect(service.getContractById(CID, 'outsider', RoleName.EDITOR)).rejects.toMatchObject({ status: 403 })
    await expect(service.getContractVersions(CID, 'outsider', RoleName.MANGAKA)).rejects.toMatchObject({ status: 403 })
    await expect(service.getContractVersionById(CID, VID, 'outsider', 'ASSISTANT')).rejects.toMatchObject({
      status: 403
    })
    repo.findVersionById.mockResolvedValue(null)
    await expect(service.getContractVersionById(CID, VID, 'editor', RoleName.EDITOR)).rejects.toMatchObject({
      status: 404
    })
  })

  it('rejects PDF export for a missing, unauthorized or unsigned contract', async () => {
    const { service, repo } = setup()
    repo.findByIdForPdf.mockResolvedValueOnce(null)
    await expect(service.exportPdf(CID, 'editor', RoleName.EDITOR)).rejects.toMatchObject({ status: 404 })
    repo.findByIdForPdf.mockResolvedValueOnce({
      status: ContractStatus.FULLY_EXECUTED,
      editorId: 'editor',
      mangakaId: 'mangaka'
    })
    await expect(service.exportPdf(CID, 'outsider', RoleName.EDITOR)).rejects.toMatchObject({ status: 403 })
    repo.findByIdForPdf.mockResolvedValueOnce({
      status: ContractStatus.BOARD_APPROVED,
      editorId: 'editor',
      mangakaId: 'mangaka'
    })
    await expect(service.exportPdf(CID, 'editor', RoleName.EDITOR)).rejects.toMatchObject({ status: 409 })
  })

  it('renders and registers an immutable PDF with execution context', async () => {
    const { service, repo, pdf, assets } = setup()
    const older = new Date('2026-03-01T00:00:00.000Z')
    const latest = new Date('2026-04-01T00:00:00.000Z')
    repo.findByIdForPdf.mockResolvedValue({
      id: CID,
      status: ContractStatus.FULLY_EXECUTED,
      editorId: 'editor',
      mangakaId: 'mangaka',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      contractType: 'REVENUE_SHARE',
      valuationAmount: 1_000,
      publisherOwnershipPct: 60,
      mangakaOwnershipPct: 40,
      terminationClause: 'clause',
      contractStart: new Date('2026-01-01T00:00:00.000Z'),
      contractEnd: null,
      mangakaSignedAt: new Date('2026-02-01T00:00:00.000Z'),
      boardSignedAt: null,
      series: { id: 's1', title: 'Series', magazine: null },
      mangaka: { displayName: 'Mangaka' },
      editor: null,
      boardDecision: null,
      conditions: [
        {
          conditionType: 'REVENUE_SHARE',
          thresholdConfig: {},
          payoutAmount: null,
          payoutPct: 40,
          status: 'PENDING'
        }
      ],
      versions: [{}, {}],
      amendments: [
        { status: 'DRAFT', fullyExecutedAt: null },
        { status: 'FULLY_EXECUTED', fullyExecutedAt: latest },
        { status: 'FULLY_EXECUTED', fullyExecutedAt: older },
        { status: 'FULLY_EXECUTED', fullyExecutedAt: null }
      ],
      contractSignatures: [
        { role: 'BOARD_EDITOR', userId: 'known', user: { displayName: 'Board' }, signedAt: older },
        { role: 'BOARD_EDITOR', userId: 'fallback', user: null, signedAt: latest },
        { role: 'MANGAKA', userId: 'mangaka', user: null, signedAt: older }
      ]
    })

    await expect(service.exportPdf(CID, 'board', RoleName.BOARD_MEMBER)).resolves.toEqual({
      downloadUrl: 'signed',
      expiresAt: 'later',
      key: `contracts/${CID}/contract-v2-a3-t2.pdf`
    })
    expect(pdf.renderContractPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        editor: null,
        boardDecision: null,
        latestAmendmentAt: latest.toISOString(),
        signatures: [
          expect.objectContaining({ displayName: 'Board' }),
          expect.objectContaining({ displayName: 'fallback' })
        ]
      })
    )
    expect(assets.registerGeneratedAsset).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedBy: 'board', filePath: `contracts/${CID}/contract-v2-a3-t2.pdf` })
    )
  })

  it('reuses an existing PDF without duplicate rendering or asset registration', async () => {
    const { service, repo, storage, pdf, assets } = setup()
    storage.headObjectExists.mockResolvedValue(true)
    repo.findByIdForPdf.mockResolvedValue({
      id: CID,
      status: ContractStatus.TERMINATED,
      editorId: 'editor',
      mangakaId: 'mangaka',
      versions: [{}],
      amendments: []
    })

    await service.exportPdf(CID, 'mangaka', RoleName.MANGAKA)

    expect(pdf.renderContractPdf).not.toHaveBeenCalled()
    expect(storage.putObject).not.toHaveBeenCalled()
    expect(assets.registerGeneratedAsset).not.toHaveBeenCalled()
  })
})

describe('ContractService workflow guards', () => {
  it('dispatches supported statuses and rejects unsupported workflow input', async () => {
    const { service, workflow } = setup()
    const send = jest.spyOn(workflow, 'sendToMangaka').mockResolvedValue({ id: CID } as never)
    const approve = jest.spyOn(workflow, 'mangakaApprove').mockResolvedValue({ id: CID } as never)

    await service.updateStatusByWorkflow(CID, 'u1', ContractStatus.MANGAKA_REVIEW)
    await service.updateStatusByWorkflow(CID, 'u1', ContractStatus.MANGAKA_APPROVED)
    expect(send).toHaveBeenCalledWith(CID, 'u1')
    expect(approve).toHaveBeenCalledWith(CID, 'u1')
    expect(() => service.updateStatusByWorkflow(CID, 'u1', ContractStatus.VOIDED)).toThrow()
  })

  it('sends a draft after ownership check and records its transition', async () => {
    const { service, repo, notification, audit } = setup()
    repo.findById.mockResolvedValue({
      id: CID,
      editorId: 'editor',
      mangakaId: 'mangaka',
      status: ContractStatus.DRAFT
    })
    repo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.MANGAKA_REVIEW })

    await service.sendToMangaka(CID, 'editor')

    expect(notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'mangaka', referenceType: 'CONTRACT_SENT_TO_MANGAKA' })
    )
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'editor',
        fromState: ContractStatus.DRAFT,
        toState: ContractStatus.MANGAKA_REVIEW
      })
    )
  })

  it('rejects missing and non-owning editors before sending a draft', async () => {
    const { service, repo } = setup()
    repo.findById.mockResolvedValueOnce(null)
    await expect(service.sendToMangaka(CID, 'editor')).rejects.toMatchObject({ status: 404 })
    repo.findById.mockResolvedValueOnce({
      editorId: 'other',
      mangakaId: 'mangaka',
      status: ContractStatus.DRAFT
    })
    await expect(service.sendToMangaka(CID, 'editor')).rejects.toMatchObject({ status: 403 })
  })

  it('updates editable terms while resetting signatures and rejects invalid editors/states', async () => {
    const { service, repo } = setup()
    repo.findById.mockResolvedValueOnce(null)
    await expect(service.editorUpdateContract(CID, 'editor', {})).rejects.toMatchObject({ status: 404 })
    repo.findById.mockResolvedValueOnce({
      editorId: 'other',
      mangakaId: 'mangaka',
      status: ContractStatus.NEGOTIATION
    })
    await expect(service.editorUpdateContract(CID, 'editor', {})).rejects.toMatchObject({ status: 403 })
    repo.findById.mockResolvedValueOnce({
      editorId: 'editor',
      mangakaId: 'mangaka',
      status: ContractStatus.FULLY_EXECUTED
    })
    await expect(service.editorUpdateContract(CID, 'editor', {})).rejects.toMatchObject({ status: 409 })

    repo.findById.mockResolvedValueOnce({
      editorId: 'editor',
      mangakaId: 'mangaka',
      status: ContractStatus.NEGOTIATION
    })
    repo.updateAndLogVersion.mockResolvedValue({ id: CID })
    await service.editorUpdateContract(CID, 'editor', { valuationAmount: 2_000 }, 'new terms')
    expect(repo.updateAndLogVersion).toHaveBeenCalledWith(
      CID,
      {
        valuationAmount: 2_000,
        status: ContractStatus.NEGOTIATION,
        mangakaSignedAt: null,
        boardSignedAt: null
      },
      'editor',
      'new terms'
    )
  })

  it('guards mangaka signing preconditions before consuming OTP', async () => {
    const { service, repo, otp } = setup()
    repo.findById.mockResolvedValueOnce(null)
    await expect(service.signByMangakaWithOtp(CID, 'm1', 'm@x.test', '123456')).rejects.toMatchObject({ status: 404 })
    repo.findById.mockResolvedValueOnce({
      mangakaSignedAt: new Date(),
      status: ContractStatus.BOARD_APPROVED,
      mangakaId: 'm1'
    })
    await expect(service.signByMangakaWithOtp(CID, 'm1', 'm@x.test', '123456')).rejects.toMatchObject({ status: 400 })
    repo.findById.mockResolvedValueOnce({
      mangakaSignedAt: null,
      status: ContractStatus.BOARD_APPROVED,
      mangakaId: 'other'
    })
    await expect(service.signByMangakaWithOtp(CID, 'm1', 'm@x.test', '123456')).rejects.toMatchObject({ status: 403 })
    expect(otp.validateOtpCode).not.toHaveBeenCalled()
  })

  it('guards board signing preconditions before consuming OTP', async () => {
    const cases = [
      [null, 404],
      [{ boardSignedAt: new Date() }, 400],
      [{ boardSignedAt: null, boardDecision: null }, 400],
      [
        {
          boardSignedAt: null,
          status: ContractStatus.DRAFT,
          boardDecision: { boardSession: { allowedEditorIds: ['b1'] } }
        },
        409
      ],
      [
        {
          boardSignedAt: null,
          status: ContractStatus.BOARD_APPROVED,
          boardDecision: { boardSession: { allowedEditorIds: ['other'] } }
        },
        403
      ]
    ] as const

    for (const [contract, status] of cases) {
      const { service, repo, otp } = setup()
      repo.findWithBoardDecision.mockResolvedValue(contract)
      await expect(service.signByBoardWithOtp(CID, 'b1', 'b@x.test', '123456')).rejects.toMatchObject({ status })
      expect(otp.validateOtpCode).not.toHaveBeenCalled()
    }

    const { service, repo } = setup()
    repo.findWithBoardDecision.mockResolvedValue({
      boardSignedAt: null,
      status: ContractStatus.BOARD_APPROVED,
      boardDecision: { boardSession: { allowedEditorIds: ['b1'] } }
    })
    repo.findSpecificSignature.mockResolvedValue({ id: 'signature' })
    await expect(service.signByBoardWithOtp(CID, 'b1', 'b@x.test', '123456')).rejects.toMatchObject({ status: 400 })
  })

  it('separates signed and pending board members in status progress', async () => {
    const { service, repo } = setup()
    const signedAt = new Date()
    repo.getContractSignaturesProgress.mockResolvedValue({
      id: CID,
      status: ContractStatus.BOARD_APPROVED,
      mangakaId: 'm1',
      mangakaSignedAt: signedAt,
      boardDecision: { boardSession: { allowedEditorIds: ['b1', 'b2'] } },
      contractSignatures: [{ userId: 'b1', signedAt }]
    })

    await expect(service.checkContractStatus(CID, 'm1', 'MANGAKA')).resolves.toMatchObject({
      mangaka: { isSigned: true },
      boardProgress: {
        totalRequired: 2,
        totalSigned: 1,
        signedEditors: [{ id: 'b1', actionAt: signedAt }],
        pendingEditors: [{ id: 'b2', actionAt: null }]
      }
    })
  })

  it('rejects status progress for missing context, wrong owner and out-of-roster board editor', async () => {
    const { service, repo } = setup()
    repo.getContractSignaturesProgress.mockResolvedValueOnce(null)
    await expect(service.checkContractStatus(CID, 'm1', 'MANGAKA')).rejects.toMatchObject({ status: 404 })
    repo.getContractSignaturesProgress.mockResolvedValueOnce({
      mangakaId: 'm1',
      boardDecision: { boardSession: { allowedEditorIds: [] } }
    })
    await expect(service.checkContractStatus(CID, 'other', 'MANGAKA')).rejects.toMatchObject({ status: 403 })
    repo.getContractSignaturesProgress.mockResolvedValueOnce({ mangakaId: 'm1', boardDecision: null })
    await expect(service.checkContractStatus(CID, 'm1', 'EDITOR')).rejects.toMatchObject({ status: 400 })
    repo.getContractSignaturesProgress.mockResolvedValueOnce({
      mangakaId: 'm1',
      boardDecision: { boardSession: { allowedEditorIds: ['b1'] } }
    })
    await expect(service.checkContractStatus(CID, 'outsider', 'BOARD_EDITOR')).rejects.toMatchObject({ status: 403 })
  })
})
