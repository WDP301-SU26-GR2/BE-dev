import { SeriesStatus } from '@prisma/client'
import { SeriesPitchService } from './series-pitch.service'

function make(status: SeriesStatus) {
  const series = {
    id: 's1',
    mangakaId: 'm1',
    editorId: 'e1',
    status,
    createdAt: new Date(),
    proposal: { status: 'PROPOSAL_APPROVED', nameId: 'n1', createdAt: new Date() }
  }
  const seriesRepository = {
    findById: jest.fn().mockResolvedValue(series),
    updateProposalStatus: jest.fn().mockResolvedValue(series)
  }
  const seriesStateService = { transition: jest.fn().mockResolvedValue({ ...series, status: SeriesStatus.PITCHED }) }
  const service = new SeriesPitchService(seriesRepository as never, seriesStateService as never)
  return { service, seriesRepository, seriesStateService }
}

describe('SeriesPitchService.pitch', () => {
  it('pitches when READY_TO_PITCH', async () => {
    const { service, seriesRepository, seriesStateService } = make(SeriesStatus.READY_TO_PITCH)
    const res = await service.pitch('e1', 's1')
    expect(seriesRepository.updateProposalStatus).toHaveBeenCalledWith('s1', 'PITCHED')
    expect(seriesStateService.transition).toHaveBeenCalledWith('s1', SeriesStatus.PITCHED, { changedBy: 'e1' })
    expect(res.status).toBe(SeriesStatus.PITCHED)
  })

  it('throws 409 when not READY_TO_PITCH', async () => {
    const { service, seriesStateService } = make(SeriesStatus.IN_REVIEW)
    await expect(service.pitch('e1', 's1')).rejects.toBeDefined()
    expect(seriesStateService.transition).not.toHaveBeenCalled()
  })
})
