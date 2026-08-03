import { SeriesRequestStatus } from '@prisma/client'
import {
  InvalidSeriesRequestTransitionException,
  SeriesRequestNotFoundException
} from '../errors/series-request.errors'
import { SeriesRequestStateService } from './series-request-state.service'

describe('SeriesRequestStateService', () => {
  const makeRepo = (row: unknown) => ({
    findById: jest.fn().mockResolvedValue(row),
    applyTransition: jest.fn().mockResolvedValue({ id: 'r1', status: SeriesRequestStatus.ACCEPTED })
  })
  const audit = { record: jest.fn().mockResolvedValue(undefined) }

  const build = (row: unknown) => {
    const repo = makeRepo(row)
    return { repo, service: new SeriesRequestStateService(repo as never, audit as never) }
  }

  beforeEach(() => jest.clearAllMocks())

  it('không tìm thấy request → 404', async () => {
    const { service } = build(null)
    await expect(service.transition('r1', SeriesRequestStatus.ACCEPTED, { by: 'u1' })).rejects.toBe(
      SeriesRequestNotFoundException
    )
  })

  it('PENDING → ACCEPTED hợp lệ, ghi statusHistory + audit', async () => {
    const { repo, service } = build({ id: 'r1', status: SeriesRequestStatus.PENDING, seriesId: 's1' })
    await service.transition('r1', SeriesRequestStatus.ACCEPTED, { by: 'u1', reason: 'ok' })
    expect(repo.applyTransition).toHaveBeenCalledWith('r1', {
      from: SeriesRequestStatus.PENDING,
      to: SeriesRequestStatus.ACCEPTED,
      by: 'u1',
      reason: 'ok',
      extra: undefined
    })
    expect(audit.record).toHaveBeenCalled()
  })

  it('request đã ACCEPTED → transition tiếp bị chặn 409', async () => {
    const { service } = build({ id: 'r1', status: SeriesRequestStatus.ACCEPTED, seriesId: 's1' })
    await expect(service.transition('r1', SeriesRequestStatus.REJECTED, { by: 'u1' })).rejects.toBe(
      InvalidSeriesRequestTransitionException
    )
  })

  it('request đã CANCELLED → không accept được', async () => {
    const { service } = build({ id: 'r1', status: SeriesRequestStatus.CANCELLED, seriesId: 's1' })
    await expect(service.transition('r1', SeriesRequestStatus.ACCEPTED, { by: 'u1' })).rejects.toBe(
      InvalidSeriesRequestTransitionException
    )
  })
})
