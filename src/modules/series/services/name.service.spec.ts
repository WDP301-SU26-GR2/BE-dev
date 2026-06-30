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
    updateNamePages: jest.fn().mockResolvedValue(name),
    appendNamePage: jest
      .fn()
      .mockImplementation((id, page) => Promise.resolve({ ...name, pages: [...name.pages, page] }))
  }
  const seriesStateService = { tryAdvanceToReadyToPitch: jest.fn().mockResolvedValue(series) }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new NameService(seriesRepository as never, seriesStateService as never, notificationService as never)
  return { service, seriesRepository, seriesStateService, notificationService, name }
}

describe('NameService', () => {
  it('resubmit: REVISION->IN_REVIEW with version++', async () => {
    const { service, seriesRepository } = make({ status: NameStatus.REVISION, version: 2 })
    await service.resubmit('m1', 's1', 'n1')
    expect(seriesRepository.updateNameStatus).toHaveBeenCalledWith('n1', { status: NameStatus.IN_REVIEW, version: 3 })
  })

  it('approve: SUBMITTED->APPROVED then tries to advance series', async () => {
    const { service, seriesRepository, seriesStateService, notificationService } = make({
      status: NameStatus.SUBMITTED
    })
    await service.approve('e1', 's1', 'n1')
    expect(seriesRepository.updateNameStatus).toHaveBeenCalledWith('n1', { status: NameStatus.APPROVED })
    expect(seriesStateService.tryAdvanceToReadyToPitch).toHaveBeenCalledWith('s1', 'e1')
    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'm1', referenceType: 'NAME_APPROVED', content: expect.any(String) })
    )
  })

  it('requestRevision notifies with NAME_REVISION_REQUESTED', async () => {
    const { service, notificationService } = make({ status: NameStatus.SUBMITTED })

    await service.requestRevision('e1', 's1', 'n1', 'fix pacing')

    expect(notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'm1',
        referenceType: 'NAME_REVISION_REQUESTED',
        content: expect.any(String)
      })
    )
  })

  it('approve by a non-assigned editor throws', async () => {
    const { service } = make({ status: NameStatus.SUBMITTED })

    await expect(service.approve('intruder', 's1', 'n1')).rejects.toBeDefined()
  })

  it('addPage: DRAFT appends one page', async () => {
    const { service, seriesRepository } = make({ status: NameStatus.DRAFT, pages: [] })
    const page = { pageNumber: 1, fileUrl: 'k1' }

    const res = await service.addPage('m1', 's1', 'n1', page)

    expect(seriesRepository.appendNamePage).toHaveBeenCalledWith('n1', page)
    expect(res.pages).toContainEqual(page)
  })

  it('addPage: non-editable status throws', async () => {
    const { service } = make({ status: NameStatus.APPROVED })

    await expect(service.addPage('m1', 's1', 'n1', { pageNumber: 1, fileUrl: 'k' })).rejects.toBeDefined()
  })
})
