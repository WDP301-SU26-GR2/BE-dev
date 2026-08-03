import { ChapterStatus, SeriesStatus } from '@prisma/client'
import { ChapterProgressQueryRepository } from './chapter-progress-query.repository'

describe('ChapterProgressQueryRepository — Spec 30 HIATUS filter', () => {
  const makeRepo = (schedules: unknown[]) => {
    const prisma = {
      schedule: { findMany: jest.fn().mockResolvedValue(schedules) }
    }
    return new ChapterProgressQueryRepository(prisma as never)
  }

  it('bỏ qua chapter của bộ truyện đang HIATUS', async () => {
    const repo = makeRepo([
      {
        chapterId: 'c1',
        chapter: {
          seriesId: 's1',
          status: ChapterStatus.DRAFT,
          hold: null,
          chapterNumber: 1,
          series: { title: 'Bộ A', status: SeriesStatus.HIATUS }
        }
      }
    ])
    const result = await repo.findChaptersNearDeadline(new Date())
    expect(result).toEqual([])
  })

  it('giữ chapter của bộ truyện đang SERIALIZED', async () => {
    const repo = makeRepo([
      {
        chapterId: 'c1',
        chapter: {
          seriesId: 's1',
          status: ChapterStatus.DRAFT,
          hold: null,
          chapterNumber: 1,
          series: { title: 'Bộ A', status: SeriesStatus.SERIALIZED }
        }
      }
    ])
    const result = await repo.findChaptersNearDeadline(new Date())
    expect(result).toHaveLength(1)
    expect(result[0].chapterId).toBe('c1')
  })

  it('vẫn loại chapter đã hold (cascade từ hiatus) — defense in depth', async () => {
    const repo = makeRepo([
      {
        chapterId: 'c1',
        chapter: {
          seriesId: 's1',
          status: ChapterStatus.DRAFT,
          hold: { reason: 'x' },
          chapterNumber: 1,
          series: { title: 'Bộ A', status: SeriesStatus.HIATUS }
        }
      }
    ])
    const result = await repo.findChaptersNearDeadline(new Date())
    expect(result).toEqual([])
  })
})
