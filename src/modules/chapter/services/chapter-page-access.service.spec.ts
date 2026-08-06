import { ChapterPageAccessService } from './chapter-page-access.service'
import { ChapterAccessDeniedException, ChapterNotFoundException } from '../errors/chapter.errors'

const SERIES_ID = '507f1f77bcf86cd799439011'

function make() {
  const chapterRepository = { findSeriesById: jest.fn() }
  const studioAssignmentService = { findActiveForPair: jest.fn() }
  const service = new ChapterPageAccessService(chapterRepository as never, studioAssignmentService as never)
  return { service, chapterRepository, studioAssignmentService }
}

const series = (overrides: Record<string, unknown> = {}) => ({
  id: SERIES_ID,
  mangakaId: 'mangaka-1',
  editorId: 'editor-1',
  ...overrides
})

describe('ChapterPageAccessService.assertSeriesReadAccess', () => {
  it('rejects a malformed seriesId before touching the repository', async () => {
    const { service, chapterRepository } = make()
    await expect(service.assertSeriesReadAccess('u1', 'EDITOR', 'not-an-id')).rejects.toBe(ChapterNotFoundException)
    expect(chapterRepository.findSeriesById).not.toHaveBeenCalled()
  })

  it('rejects a missing series', async () => {
    const { service, chapterRepository } = make()
    chapterRepository.findSeriesById.mockResolvedValue(null)
    await expect(service.assertSeriesReadAccess('u1', 'EDITOR', SERIES_ID)).rejects.toBe(ChapterNotFoundException)
  })

  it('allows the owning mangaka and denies a non-owner mangaka', async () => {
    const owner = make()
    owner.chapterRepository.findSeriesById.mockResolvedValue(series())
    await expect(owner.service.assertSeriesReadAccess('mangaka-1', 'MANGAKA', SERIES_ID)).resolves.toBeUndefined()

    const other = make()
    other.chapterRepository.findSeriesById.mockResolvedValue(series())
    await expect(other.service.assertSeriesReadAccess('mangaka-9', 'MANGAKA', SERIES_ID)).rejects.toBe(
      ChapterAccessDeniedException
    )
  })

  it('allows the assigned editor and denies an unassigned editor', async () => {
    const assigned = make()
    assigned.chapterRepository.findSeriesById.mockResolvedValue(series())
    await expect(assigned.service.assertSeriesReadAccess('editor-1', 'EDITOR', SERIES_ID)).resolves.toBeUndefined()

    const other = make()
    other.chapterRepository.findSeriesById.mockResolvedValue(series())
    await expect(other.service.assertSeriesReadAccess('editor-9', 'EDITOR', SERIES_ID)).rejects.toBe(
      ChapterAccessDeniedException
    )
  })

  it('allows an assistant with an active assignment and denies one without', async () => {
    const active = make()
    active.chapterRepository.findSeriesById.mockResolvedValue(series())
    active.studioAssignmentService.findActiveForPair.mockResolvedValue({ id: 'assignment-1' })
    await expect(active.service.assertSeriesReadAccess('assistant-1', 'ASSISTANT', SERIES_ID)).resolves.toBeUndefined()
    expect(active.studioAssignmentService.findActiveForPair).toHaveBeenCalledWith('mangaka-1', 'assistant-1')

    const inactive = make()
    inactive.chapterRepository.findSeriesById.mockResolvedValue(series())
    inactive.studioAssignmentService.findActiveForPair.mockResolvedValue(null)
    await expect(inactive.service.assertSeriesReadAccess('assistant-1', 'ASSISTANT', SERIES_ID)).rejects.toBe(
      ChapterAccessDeniedException
    )
  })

  it.each(['BOARD_MEMBER', 'SUPER_ADMIN'])('allows %s regardless of ownership', async (roleName) => {
    const { service, chapterRepository } = make()
    chapterRepository.findSeriesById.mockResolvedValue(series())
    await expect(service.assertSeriesReadAccess('someone', roleName, SERIES_ID)).resolves.toBeUndefined()
  })
})
