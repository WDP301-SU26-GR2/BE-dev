import { SeriesStatus } from '@prisma/client'
import {
  NotAssignedEditorException,
  ReviewAlreadyStartedException,
  SeriesAlreadyClaimedException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { SeriesClaimService } from './series-claim.service'

const SID = '0123456789abcdef01234567'

const seriesRow = (over: Record<string, unknown> = {}) => ({
  id: SID,
  mangakaId: 'm1',
  editorId: null,
  coOwnerId: null,
  parentSeriesId: null,
  title: 'T',
  genre: null,
  demographic: null,
  publicationType: null,
  status: SeriesStatus.IN_REVIEW,
  statusReason: null,
  relationshipType: null,
  coOwnerApprovalRequired: false,
  reviewStartedAt: null,
  statusHistory: [],
  createdAt: new Date('2026-06-27T00:00:00.000Z'),
  proposal: null,
  ...over
})

function make() {
  const seriesRepository = {
    claimSeries: jest.fn(),
    releaseSeries: jest.fn(),
    findById: jest.fn()
  }
  const service = new SeriesClaimService(seriesRepository as never)
  return { service, seriesRepository }
}

describe('SeriesClaimService.claim', () => {
  it('returns the claimed series when the atomic update wins', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.claimSeries.mockResolvedValue(1)
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: 'e1' }))

    const res = await service.claim('e1', SID)

    expect(seriesRepository.claimSeries).toHaveBeenCalledWith(SID, 'e1')
    expect(res.editorId).toBe('e1')
    expect(res.reviewStartedAt).toBeNull()
  })

  it('throws SeriesNotFound when the row does not exist', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.claimSeries.mockResolvedValue(0)
    seriesRepository.findById.mockResolvedValue(null)

    await expect(service.claim('e1', SID)).rejects.toBe(SeriesNotFoundException)
  })

  it('throws SeriesAlreadyClaimed when the series is no longer claimable', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.claimSeries.mockResolvedValue(0)
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: 'e2' }))

    await expect(service.claim('e1', SID)).rejects.toBe(SeriesAlreadyClaimedException)
  })

  it('rejects malformed ids without calling the repository', async () => {
    const { service, seriesRepository } = make()

    await expect(service.claim('e1', 'not-an-id')).rejects.toBe(SeriesNotFoundException)
    expect(seriesRepository.claimSeries).not.toHaveBeenCalled()
  })
})

describe('SeriesClaimService.release', () => {
  it('returns the released series when the atomic update wins', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.releaseSeries.mockResolvedValue(1)
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: null }))

    const res = await service.release('e1', SID)

    expect(seriesRepository.releaseSeries).toHaveBeenCalledWith(SID, 'e1')
    expect(res.editorId).toBeNull()
  })

  it('throws SeriesNotFound when the row does not exist', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.releaseSeries.mockResolvedValue(0)
    seriesRepository.findById.mockResolvedValue(null)

    await expect(service.release('e1', SID)).rejects.toBe(SeriesNotFoundException)
  })

  it('throws NotAssignedEditor when another editor owns the series', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.releaseSeries.mockResolvedValue(0)
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: 'e2', reviewStartedAt: null }))

    await expect(service.release('e1', SID)).rejects.toBe(NotAssignedEditorException)
  })

  it('throws ReviewAlreadyStarted when release is attempted after review started', async () => {
    const { service, seriesRepository } = make()
    seriesRepository.releaseSeries.mockResolvedValue(0)
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: 'e1', reviewStartedAt: new Date() }))

    await expect(service.release('e1', SID)).rejects.toBe(ReviewAlreadyStartedException)
  })
})
