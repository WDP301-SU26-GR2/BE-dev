import { ProposalStatus, SeriesStatus } from '@prisma/client'
import { SeriesProposalService } from './series-proposal.service'
import {
  FranchiseConsentRequiredException,
  NotAssignedEditorException,
  NotFranchiseConsentTargetException,
  NotOriginalMangakaException,
  NotSeriesOwnerException
} from '../errors/series.errors'

const baseSeries = {
  id: 's1',
  mangakaId: 'm1',
  editorId: null,
  coOwnerId: null,
  parentSeriesId: null,
  title: 'T',
  genres: [],
  demographic: null,
  publicationType: null,
  status: SeriesStatus.DRAFT,
  statusReason: null,
  relationshipType: null,
  coOwnerApprovalRequired: false,
  reviewStartedAt: null,
  statusHistory: [],
  createdAt: new Date('2026-06-23T00:00:00.000Z'),
  proposal: {
    nameId: 'n1',
    synopsis: null,
    characterDesigns: [],
    estimatedLength: null,
    status: ProposalStatus.DRAFT,
    createdAt: new Date('2026-06-23T00:00:00.000Z')
  }
}

const baseName = {
  id: 'n1',
  seriesId: 's1',
  chapterNumber: null,
  status: 'DRAFT',
  version: 1,
  submittedAt: null,
  pages: []
}

const SID = '0123456789abcdef01234567'

function make(seriesOverride: Record<string, unknown> = {}) {
  const series = { ...baseSeries, ...seriesOverride }
  const seriesRepository = {
    findById: jest.fn().mockResolvedValue(series),
    createProposalSeries: jest.fn().mockResolvedValue({ series, name: baseName }),
    updateProposalStatus: jest
      .fn()
      .mockImplementation((id, status) => Promise.resolve({ ...series, proposal: { ...series.proposal, status } })),
    updateProposalContent: jest.fn().mockResolvedValue(series),
    reopenSeriesToDraft: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ...series, editorId: null, reviewStartedAt: null, status: SeriesStatus.DRAFT })
      ),
    deleteSeriesWithNames: jest.fn().mockResolvedValue(undefined),
    markReviewStarted: jest.fn().mockResolvedValue(undefined),
    findExecutedContractType: jest.fn().mockResolvedValue(null),
    setFranchiseConsentStatus: jest
      .fn()
      .mockImplementation((id, status) => Promise.resolve({ ...series, franchiseConsentStatus: status }))
  }
  const nameRepo = {
    updateNameStatus: jest.fn().mockResolvedValue({ ...baseName, status: 'SUBMITTED', submittedAt: new Date() })
  }
  const seriesStateService = {
    transition: jest.fn().mockImplementation((id, toStatus) => Promise.resolve({ ...series, status: toStatus })),
    tryAdvanceToReadyToPitch: jest.fn().mockResolvedValue({ ...series, status: SeriesStatus.READY_TO_PITCH })
  }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const revisionService = {
    openSafe: jest.fn().mockResolvedValue({ round: 1 }),
    currentRound: jest.fn().mockResolvedValue(1)
  }
  const service = new SeriesProposalService(
    seriesRepository as never,
    nameRepo as never,
    seriesStateService as never,
    notificationService as never,
    revisionService as never
  )
  return { service, seriesRepository, nameRepo, seriesStateService, notificationService, revisionService }
}

describe('SeriesProposalService', () => {
  it('createProposal returns mapped series + name', async () => {
    const { service, seriesRepository } = make()
    const res = await service.createProposal('m1', { title: 'T', genres: [], characterDesigns: [], namePages: [] })
    expect(seriesRepository.createProposalSeries).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ title: 'T' }),
      undefined
    )
    expect(res.series.id).toBe('s1')
    expect(res.name.id).toBe('n1')
  })

  it('submit: proposal->PROPOSAL_REVIEW, name->SUBMITTED, series DRAFT->IN_REVIEW via state service', async () => {
    const { service, seriesRepository, nameRepo, seriesStateService } = make()
    const res = await service.submit('m1', 's1')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.PROPOSAL_REVIEW)
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith('n1', expect.objectContaining({ status: 'SUBMITTED' }))
    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.IN_REVIEW, { changedBy: 'm1' })
    expect(res.series.status).toBe(SeriesStatus.IN_REVIEW)
    expect(res.name.status).toBe('SUBMITTED')
  })

  it('submit by non-owner throws', async () => {
    const { service } = make()
    await expect(service.submit('other', 's1')).rejects.toBeDefined()
  })

  it('submit throws when proposal missing nameId', async () => {
    const { service } = make({ proposal: { ...baseSeries.proposal, nameId: null } })
    await expect(service.submit('m1', 's1')).rejects.toBeDefined()
  })

  it('approve: proposal->PROPOSAL_APPROVED then tries to advance', async () => {
    const { service, seriesRepository, seriesStateService, notificationService } = make({
      editorId: 'editor1',
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })
    await service.approve('editor1', 's1')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.PROPOSAL_APPROVED)
    expect(seriesRepository.markReviewStarted).toHaveBeenCalledWith('s1')
    expect(seriesStateService.tryAdvanceToReadyToPitch).toHaveBeenCalledWith('s1', 'editor1')
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'm1', referenceType: 'PROPOSAL_APPROVED', content: expect.any(String) })
    )
  })

  it('withdraw khi transition bị chặn (PITCHED) → KHÔNG ghi proposal status (chống lệch dữ liệu)', async () => {
    const { service, seriesRepository, seriesStateService } = make({ status: SeriesStatus.PITCHED })
    const blocked = new Error('Error.InvalidSeriesTransition')
    seriesStateService.transition.mockRejectedValue(blocked)
    await expect(service.withdraw('m1', 's1', 'đổi ý')).rejects.toThrow(blocked)
    expect(seriesRepository.updateProposalStatus).not.toHaveBeenCalled()
  })

  it('withdraw hợp lệ: transition TRƯỚC rồi mới ghi proposal WITHDRAWN', async () => {
    const { service, seriesRepository, seriesStateService } = make({ status: SeriesStatus.IN_REVIEW })
    await service.withdraw('m1', 's1', 'đổi ý')
    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.WITHDRAWN, {
      changedBy: 'm1',
      reason: 'đổi ý'
    })
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.WITHDRAWN)
    const transitionOrder = seriesStateService.transition.mock.invocationCallOrder[0]
    const proposalOrder = seriesRepository.updateProposalStatus.mock.invocationCallOrder[0]
    expect(transitionOrder).toBeLessThan(proposalOrder)
  })

  it('reopen: ABANDONED → DRAFT + unset editor + proposal DRAFT + Name DRAFT', async () => {
    const { service, seriesRepository, nameRepo, seriesStateService } = make({
      status: SeriesStatus.ABANDONED,
      editorId: 'e1',
      proposal: { ...baseSeries.proposal, status: ProposalStatus.REJECTED }
    })

    await service.reopen('m1', 's1')

    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.DRAFT, { changedBy: 'm1' })
    expect(seriesRepository.reopenSeriesToDraft).toHaveBeenCalledWith('s1')
    expect(nameRepo.updateNameStatus).toHaveBeenCalledWith('n1', { status: 'DRAFT' })
  })

  it('reopen by a non-owner throws before transition', async () => {
    const { service, seriesStateService } = make({ status: SeriesStatus.ABANDONED })

    await expect(service.reopen('other', 's1')).rejects.toBe(NotSeriesOwnerException)
    expect(seriesStateService.transition).not.toHaveBeenCalled()
  })

  it('reopenForReview: REJECTED → IN_REVIEW + proposal revision + keeps editor + notifies mangaka', async () => {
    const { service, seriesRepository, seriesStateService, notificationService } = make({
      status: SeriesStatus.REJECTED,
      editorId: 'e1',
      reviewStartedAt: new Date('2026-07-18T00:00:00.000Z'),
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PITCHED }
    })

    await service.reopenForReview('e1', 's1', 'Hội đồng yêu cầu làm lại')

    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.IN_REVIEW, {
      changedBy: 'e1',
      reason: 'Hội đồng yêu cầu làm lại'
    })
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.PROPOSAL_REVISION)
    expect(seriesRepository.reopenSeriesToDraft).not.toHaveBeenCalled()
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'm1', referenceType: 'SERIES_REOPENED_FOR_REVIEW' })
    )
  })

  it('reopenForReview by another editor throws before transition', async () => {
    const { service, seriesStateService } = make({
      status: SeriesStatus.REJECTED,
      editorId: 'e1',
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PITCHED }
    })

    await expect(service.reopenForReview('e2', 's1', 'x')).rejects.toBe(NotAssignedEditorException)
    expect(seriesStateService.transition).not.toHaveBeenCalled()
  })

  it('reject from REJECTED → ABANDONED without marking review started again', async () => {
    const { service, seriesRepository, seriesStateService } = make({
      status: SeriesStatus.REJECTED,
      editorId: 'e1',
      reviewStartedAt: new Date('2026-07-18T00:00:00.000Z'),
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PITCHED }
    })

    await service.reject('e1', 's1', 'Dừng concept')

    expect(seriesRepository.markReviewStarted).not.toHaveBeenCalled()
    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.ABANDONED, {
      changedBy: 'e1',
      reason: 'Dừng concept'
    })
  })

  it('withdraw from REJECTED notifies the assigned editor after both primary writes', async () => {
    const { service, seriesRepository, seriesStateService, notificationService } = make({
      status: SeriesStatus.REJECTED,
      editorId: 'e1',
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PITCHED }
    })

    await service.withdraw('m1', 's1', 'Dừng concept')

    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'e1', referenceType: 'SERIES_WITHDRAWN_AFTER_REJECT' })
    )
    expect(seriesStateService.transition.mock.invocationCallOrder[0]).toBeLessThan(
      notificationService.notifySafe.mock.invocationCallOrder[0]
    )
    expect(seriesRepository.updateProposalStatus.mock.invocationCallOrder[0]).toBeLessThan(
      notificationService.notifySafe.mock.invocationCallOrder[0]
    )
  })

  it('reject: proposal->REJECTED, series->ABANDONED with reason', async () => {
    const { service, seriesRepository, seriesStateService, notificationService } = make({
      editorId: 'editor1',
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })
    await service.reject('editor1', 's1', 'không phù hợp')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.REJECTED)
    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.ABANDONED, {
      changedBy: 'editor1',
      reason: 'không phù hợp'
    })
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'm1', referenceType: 'PROPOSAL_REJECTED', content: expect.any(String) })
    )
  })

  it('requestRevision notifies with PROPOSAL_REVISION_REQUESTED', async () => {
    const { service, seriesRepository, notificationService, revisionService } = make({
      editorId: 'editor1',
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })
    revisionService.openSafe.mockResolvedValueOnce({ round: 2 })

    await service.requestRevision('editor1', 's1', 'needs work')

    expect(revisionService.openSafe).toHaveBeenCalledWith({
      targetType: 'PROPOSAL',
      targetId: 's1',
      seriesId: 's1',
      reason: 'needs work',
      requestedBy: 'editor1',
      recipientId: 'm1'
    })
    expect(seriesRepository.updateProposalStatus.mock.invocationCallOrder[0]).toBeLessThan(
      revisionService.openSafe.mock.invocationCallOrder[0]
    )
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceType: 'PROPOSAL_REVISION_REQUESTED',
        content: 'Bản đề xuất cần chỉnh sửa (vòng 2): needs work'
      })
    )
  })

  it('resubmit notifies assigned editor with PROPOSAL_RESUBMITTED', async () => {
    const { service, notificationService, revisionService } = make({
      editorId: 'editor1',
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVISION }
    })
    revisionService.currentRound.mockResolvedValueOnce(2)

    await service.resubmit('m1', 's1')

    expect(revisionService.currentRound).toHaveBeenCalledWith('PROPOSAL', 's1')
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'editor1',
        referenceType: 'PROPOSAL_RESUBMITTED',
        content: 'Đã nộp lại bản đề xuất (vòng 2)'
      })
    )
  })

  it('approve by a non-assigned editor throws', async () => {
    const { service } = make({
      editorId: 'editor1',
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })

    await expect(service.approve('intruder', 's1')).rejects.toBeDefined()
  })

  it('updateProposal allows editing while proposal is in PROPOSAL_REVISION', async () => {
    const { service, seriesRepository } = make({
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVISION }
    })

    await service.updateProposal('m1', 's1', { synopsis: 'v2' })

    expect(seriesRepository.updateProposalContent).toHaveBeenCalledWith('s1', { synopsis: 'v2' })
  })

  it('updateProposal rejects edits while proposal is in PROPOSAL_REVIEW', async () => {
    const { service } = make({
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })

    await expect(service.updateProposal('m1', 's1', { synopsis: 'x' })).rejects.toBeDefined()
  })

  it('deleteProposal deletes DRAFT proposal and returns message', async () => {
    const { service, seriesRepository } = make({ id: SID, status: SeriesStatus.DRAFT })

    const res = await service.deleteProposal('m1', SID)

    expect(seriesRepository.deleteSeriesWithNames).toHaveBeenCalledWith(SID)
    expect(res.message).toBeDefined()
  })

  it('deleteProposal rejects non-DRAFT series', async () => {
    const { service } = make({ id: SID, status: SeriesStatus.IN_REVIEW })

    await expect(service.deleteProposal('m1', SID)).rejects.toBeDefined()
  })

  it('deleteProposal rejects non-owner', async () => {
    const { service } = make({ id: SID, status: SeriesStatus.DRAFT })

    await expect(service.deleteProposal('other', SID)).rejects.toBeDefined()
  })

  it('deleteProposal rejects malformed ids before repository lookup', async () => {
    const { service, seriesRepository } = make()

    await expect(service.deleteProposal('m1', 'bad-id')).rejects.toBeDefined()
    expect(seriesRepository.findById).not.toHaveBeenCalled()
  })
})

describe('franchise gate', () => {
  const FRANCHISE_ID = '507f1f77bcf86cd799439011'

  it('createProposal → PENDING when parent REVENUE_SHARE & different mangaka', async () => {
    const { service, seriesRepository, notificationService } = make()
    seriesRepository.findById = jest.fn().mockResolvedValue({ id: 'p1', mangakaId: 'A' })
    seriesRepository.findExecutedContractType = jest.fn().mockResolvedValue('REVENUE_SHARE')
    await service.createProposal('B', { parentSeriesId: 'p1', title: 't', namePages: [] } as never)
    expect(seriesRepository.createProposalSeries).toHaveBeenCalledWith('B', expect.anything(), 'PENDING')
    expect(notificationService.notifySafe).toHaveBeenCalled()
  })

  it('createProposal → undefined consent when parent FULL_BUYOUT', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.findById = jest.fn().mockResolvedValue({ id: 'p1', mangakaId: 'A' })
    seriesRepository.findExecutedContractType = jest.fn().mockResolvedValue('FULL_BUYOUT')
    await service.createProposal('B', { parentSeriesId: 'p1', title: 't', namePages: [] } as never)
    expect(seriesRepository.createProposalSeries).toHaveBeenCalledWith('B', expect.anything(), undefined)
  })

  it('submit → 409 when consent PENDING', async () => {
    const { service, seriesRepository } = make({
      status: SeriesStatus.DRAFT,
      franchiseConsentStatus: 'PENDING'
    })
    seriesRepository.findById = jest.fn().mockResolvedValue({
      id: 'd1',
      mangakaId: 'm1',
      status: SeriesStatus.DRAFT,
      franchiseConsentStatus: 'PENDING',
      proposal: { nameId: 'n1' }
    })
    await expect(service.submit('m1', 'd1')).rejects.toBe(FranchiseConsentRequiredException)
  })

  it('franchiseConsent → APPROVED by original mangaka', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.findById = jest
      .fn()
      .mockResolvedValueOnce({ id: 'd1', mangakaId: 'B', parentSeriesId: 'p1', franchiseConsentStatus: 'PENDING' })
      .mockResolvedValueOnce({ id: 'p1', mangakaId: 'A' })
    seriesRepository.setFranchiseConsentStatus = jest.fn().mockResolvedValue({
      id: 'd1',
      mangakaId: 'B',
      status: SeriesStatus.DRAFT,
      franchiseConsentStatus: 'APPROVED',
      createdAt: new Date('2026-07-07T00:00:00.000Z')
    })
    const res = await service.franchiseConsent(FRANCHISE_ID, 'A', true)
    expect(seriesRepository.setFranchiseConsentStatus).toHaveBeenCalledWith(FRANCHISE_ID, 'APPROVED')
    expect(res.franchiseConsentStatus).toBe('APPROVED')
  })

  it('franchiseConsent → 403 when caller not original mangaka', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.findById = jest
      .fn()
      .mockResolvedValueOnce({ id: 'd1', mangakaId: 'B', parentSeriesId: 'p1', franchiseConsentStatus: 'PENDING' })
      .mockResolvedValueOnce({ id: 'p1', mangakaId: 'A' })
    await expect(service.franchiseConsent(FRANCHISE_ID, 'notA', true)).rejects.toBe(NotOriginalMangakaException)
  })

  it('franchiseConsent → 409 when status null', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.findById = jest
      .fn()
      .mockResolvedValueOnce({ id: 'd1', mangakaId: 'B', parentSeriesId: 'p1', franchiseConsentStatus: null })
    await expect(service.franchiseConsent(FRANCHISE_ID, 'A', true)).rejects.toBe(NotFranchiseConsentTargetException)
  })

  it('franchiseConsent → 404 on malformed id', async () => {
    const { service, seriesRepository } = make()
    await expect(service.franchiseConsent('bad', 'A', true)).rejects.toBeDefined()
    expect(seriesRepository.findById).not.toHaveBeenCalled()
  })
})
