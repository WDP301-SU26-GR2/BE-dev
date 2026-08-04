import { ChapterHoldSource } from '@prisma/client'
import { ChapterHiatusCascadeService } from './chapter-hiatus-cascade.service'

describe('ChapterHiatusCascadeService', () => {
  const makePrisma = (chapters: unknown[]) => {
    const chapterUpdate = jest.fn().mockResolvedValue({})
    const scheduleUpdate = jest.fn().mockResolvedValue({})
    const tx = {
      chapter: { findMany: jest.fn().mockResolvedValue(chapters), update: chapterUpdate },
      schedule: {
        findUnique: jest.fn().mockResolvedValue({ currentDeadline: new Date('2026-01-10T00:00:00Z') }),
        update: scheduleUpdate
      }
    }
    return {
      tx,
      prisma: { $transaction: jest.fn().mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) }
    }
  }

  it('hold: bỏ qua chapter đã có hold MANUAL', async () => {
    const { tx, prisma } = makePrisma([
      { id: 'c1', hold: null },
      { id: 'c2', hold: { reason: 'ốm', source: ChapterHoldSource.MANUAL } }
    ])
    const service = new ChapterHiatusCascadeService(prisma as never)
    const held = await service.holdAllForHiatus('s1', 'editor1', 'tác giả xin tạm ngưng')
    expect(held).toEqual(['c1'])
    expect(tx.chapter.update).toHaveBeenCalledTimes(1)
  })

  it('resume: chỉ gỡ hold SERIES_HIATUS, giữ MANUAL', async () => {
    const { tx, prisma } = makePrisma([
      { id: 'c1', hold: { source: ChapterHoldSource.SERIES_HIATUS } },
      { id: 'c2', hold: { source: ChapterHoldSource.MANUAL } }
    ])
    const service = new ChapterHiatusCascadeService(prisma as never)
    const released = await service.releaseAllForResume('s1', 'editor1', 0)
    expect(released).toEqual(['c1'])
    // Chapter bị biên tập viên hold tay phải KHÔNG bị chạm tới — chỉ đúng một lệnh update cho c1.
    expect(tx.chapter.update).toHaveBeenCalledTimes(1)
    const updatedIds = tx.chapter.update.mock.calls.map((call: [{ where: { id: string } }]) => call[0].where.id)
    expect(updatedIds).toEqual(['c1'])
  })

  it('resume: dời hạn nộp đúng pausedMs cho chapter được gỡ', async () => {
    const { tx, prisma } = makePrisma([{ id: 'c1', hold: { source: ChapterHoldSource.SERIES_HIATUS } }])
    const service = new ChapterHiatusCascadeService(prisma as never)
    const pausedMs = 3 * 86_400_000
    await service.releaseAllForResume('s1', 'editor1', pausedMs)
    const arg = tx.schedule.update.mock.calls[0][0]
    expect(arg.data.currentDeadline.getTime()).toBe(new Date('2026-01-13T00:00:00Z').getTime())
    expect(arg.data.extended).toBe(true)
  })
})
