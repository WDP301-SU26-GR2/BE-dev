import { NameStatus, SeriesStatus } from '@prisma/client'
import { NameService } from './name.service'

const series = {
  id: 's1',
  mangakaId: 'm1',
  editorId: 'e1',
  status: SeriesStatus.IN_REVIEW,
  reviewStartedAt: null
}

function make(nameOverride: Record<string, unknown> = {}) {
  const name = {
    id: 'n1',
    seriesId: 's1',
    chapterNumber: null,
    status: NameStatus.DRAFT,
    version: 1,
    submittedAt: null,
    pages: [],
    ...nameOverride
  }
  const seriesRepository = {
    findById: jest.fn().mockResolvedValue(series),
    findNameById: jest.fn().mockResolvedValue(name),
    updateNameStatus: jest.fn().mockImplementation((id, data) => Promise.resolve({ ...name, ...data })),
    updateNamePages: jest.fn().mockResolvedValue(name)
  }
  const seriesStateService = { tryAdvanceToReadyToPitch: jest.fn().mockResolvedValue(series) }
  const notificationService = { notify: jest.fn().mockResolvedValue(undefined) }
  const service = new NameService(seriesRepository as never, seriesStateService as never, notificationService as never)
  return { service, seriesRepository, seriesStateService, notificationService, name }
}

describe('NameService', () => {
  it('submit: DRAFT->SUBMITTED with submittedAt', async () => {
    const { service, seriesRepository } = make({ status: NameStatus.DRAFT })
    await service.submit('m1', 's1', 'n1')
    expect(seriesRepository.updateNameStatus).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ status: NameStatus.SUBMITTED })
    )
  })

  it('resubmit: REVISION->IN_REVIEW with version++', async () => {
    const { service, seriesRepository } = make({ status: NameStatus.REVISION, version: 2 })
    await service.resubmit('m1', 's1', 'n1')
    expect(seriesRepository.updateNameStatus).toHaveBeenCalledWith('n1', { status: NameStatus.IN_REVIEW, version: 3 })
  })

  it('approve: SUBMITTED->APPROVED then tries to advance series', async () => {
    const { service, seriesRepository, seriesStateService } = make({ status: NameStatus.SUBMITTED })
    await service.approve('e1', 's1', 'n1')
    expect(seriesRepository.updateNameStatus).toHaveBeenCalledWith('n1', { status: NameStatus.APPROVED })
    expect(seriesStateService.tryAdvanceToReadyToPitch).toHaveBeenCalledWith('s1', 'e1')
  })

  it('approve by a non-assigned editor throws', async () => {
    const { service } = make({ status: NameStatus.SUBMITTED })

    await expect(service.approve('intruder', 's1', 'n1')).rejects.toBeDefined()
  })

  it('submit on non-DRAFT throws', async () => {
    const { service } = make({ status: NameStatus.APPROVED })
    await expect(service.submit('m1', 's1', 'n1')).rejects.toBeDefined()
  })
})
