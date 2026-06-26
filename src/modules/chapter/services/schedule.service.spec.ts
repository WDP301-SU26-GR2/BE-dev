import { ScheduleService } from './schedule.service'

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1' }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', editorId: 'e1' }),
    findScheduleByChapterId: jest.fn().mockResolvedValue({ chapterId: 'c1', currentDeadline: new Date('2026-01-01') }),
    updateSchedule: jest.fn().mockResolvedValue({ chapterId: 'c1' }),
    extendSchedule: jest.fn().mockResolvedValue({ chapterId: 'c1', extended: true }),
    ...over
  }
}

describe('ScheduleService', () => {
  it('editor sets deadline', async () => {
    const repo = makeRepo()
    const svc = new ScheduleService(repo as never)
    await svc.setSchedule('e1', 'c1', { currentDeadline: '2026-02-01T00:00:00.000Z' })
    expect(repo.updateSchedule).toHaveBeenCalled()
  })

  it('non-editor cannot set deadline (403)', async () => {
    const repo = makeRepo()
    const svc = new ScheduleService(repo as never)
    await expect(svc.setSchedule('other', 'c1', { currentDeadline: '2026-02-01T00:00:00.000Z' })).rejects.toBeDefined()
  })

  it('editor extends deadline records extension', async () => {
    const repo = makeRepo()
    const svc = new ScheduleService(repo as never)
    await svc.extendDeadline('e1', 'c1', { newDeadline: '2026-03-01T00:00:00.000Z', reason: 'sick' })
    expect(repo.extendSchedule).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ extendedBy: 'e1', reason: 'sick' })
    )
  })
})
