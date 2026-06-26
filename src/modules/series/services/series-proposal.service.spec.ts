import { ProposalStatus, SeriesStatus } from '@prisma/client'
import { SeriesProposalService } from './series-proposal.service'

const baseSeries = {
  id: 's1',
  mangakaId: 'm1',
  editorId: null,
  coOwnerId: null,
  parentSeriesId: null,
  title: 'T',
  genre: null,
  demographic: null,
  publicationType: null,
  status: SeriesStatus.DRAFT,
  statusReason: null,
  relationshipType: null,
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

function make(seriesOverride: Record<string, unknown> = {}) {
  const series = { ...baseSeries, ...seriesOverride }
  const seriesRepository = {
    findById: jest.fn().mockResolvedValue(series),
    createProposalSeries: jest.fn().mockResolvedValue({ series, name: baseName }),
    updateProposalStatus: jest
      .fn()
      .mockImplementation((id, status) => Promise.resolve({ ...series, proposal: { ...series.proposal, status } })),
    updateProposalDraft: jest.fn().mockResolvedValue(series),
    updateNameStatus: jest.fn().mockResolvedValue({ ...baseName, status: 'SUBMITTED', submittedAt: new Date() }),
    setEditor: jest.fn().mockResolvedValue(undefined)
  }
  const seriesStateService = {
    transition: jest.fn().mockImplementation((id, toStatus) => Promise.resolve({ ...series, status: toStatus })),
    tryAdvanceToReadyToPitch: jest.fn().mockResolvedValue({ ...series, status: SeriesStatus.READY_TO_PITCH })
  }
  const notificationService = { notify: jest.fn().mockResolvedValue(undefined) }
  const service = new SeriesProposalService(
    seriesRepository as never,
    seriesStateService as never,
    notificationService as never
  )
  return { service, seriesRepository, seriesStateService, notificationService }
}

describe('SeriesProposalService', () => {
  it('createProposal returns mapped series + name', async () => {
    const { service, seriesRepository } = make()
    const res = await service.createProposal('m1', { title: 'T', characterDesigns: [], namePages: [] })
    expect(seriesRepository.createProposalSeries).toHaveBeenCalledWith('m1', expect.objectContaining({ title: 'T' }))
    expect(res.series.id).toBe('s1')
    expect(res.name.id).toBe('n1')
  })

  it('submit: proposal->PROPOSAL_REVIEW, name->SUBMITTED, series DRAFT->IN_REVIEW via state service', async () => {
    const { service, seriesRepository, seriesStateService } = make()
    const res = await service.submit('m1', 's1')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.PROPOSAL_REVIEW)
    expect(seriesRepository.updateNameStatus).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ status: 'SUBMITTED' })
    )
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
    const { service, seriesRepository, seriesStateService } = make({
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })
    await service.approve('editor1', 's1')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.PROPOSAL_APPROVED)
    expect(seriesStateService.tryAdvanceToReadyToPitch).toHaveBeenCalledWith('s1', 'editor1')
  })

  it('reject: proposal->REJECTED, series->ABANDONED with reason', async () => {
    const { service, seriesRepository, seriesStateService } = make({
      status: SeriesStatus.IN_REVIEW,
      proposal: { ...baseSeries.proposal, status: ProposalStatus.PROPOSAL_REVIEW }
    })
    await service.reject('editor1', 's1', 'không phù hợp')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', ProposalStatus.REJECTED)
    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.ABANDONED, {
      changedBy: 'editor1',
      reason: 'không phù hợp'
    })
  })
})
