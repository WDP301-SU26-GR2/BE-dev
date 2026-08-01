import { StoryboardStatus } from '@prisma/client'
import { StoryboardRepo } from './storyboard.repo'

describe('StoryboardRepo.createChapterStoryboardForChapter (Spec 28 Option A: born DRAFT)', () => {
  it('creates the chapter-storyboard at DRAFT with no submittedAt, then links it to the chapter', async () => {
    const created = { id: 'sb1' }
    const tx = {
      storyboard: { create: jest.fn().mockResolvedValue(created) },
      chapter: { update: jest.fn().mockResolvedValue({}) }
    }
    const prisma = { $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)) }
    const repo = new StoryboardRepo(prisma as never)

    const res = await repo.createChapterStoryboardForChapter({
      chapterId: 'c1',
      seriesId: 's1',
      storyboardPages: [{ pageNumber: 1, fileUrl: 'k' }]
    })

    expect(res).toBe(created)
    const createArg = tx.storyboard.create.mock.calls[0][0]
    expect(createArg.data.status).toBe(StoryboardStatus.DRAFT)
    expect(createArg.data.submittedAt ?? null).toBeNull()
    expect(tx.chapter.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { storyboardId: 'sb1' }
    })
  })
})

describe('StoryboardRepo.findChapterForStoryboardGuard (Spec 28)', () => {
  it('does not select or synchronize chapterNumber into Storyboard lifecycle data', async () => {
    const prisma = { chapter: { findFirst: jest.fn().mockResolvedValue(null) } }
    const repo = new StoryboardRepo(prisma as never)

    await repo.findChapterForStoryboardGuard('c1')

    const select = prisma.chapter.findFirst.mock.calls[0][0].select as Record<string, unknown>
    expect(select).not.toHaveProperty('chapterNumber')
  })
})
