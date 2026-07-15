import { NameStatus } from '@prisma/client'
import { NameRepo } from './name.repo'

describe('NameRepo.createChapterNameForChapter (Option A: born DRAFT)', () => {
  it('creates the chapter-Name at DRAFT with no submittedAt, then links it to the chapter', async () => {
    const created = { id: 'n1' }
    const tx = {
      name: { create: jest.fn().mockResolvedValue(created) },
      chapter: { update: jest.fn().mockResolvedValue({}) }
    }
    const prisma = { $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)) }
    const repo = new NameRepo(prisma as never)

    const res = await repo.createChapterNameForChapter({
      chapterId: 'c1',
      seriesId: 's1',
      chapterNumber: 2,
      namePages: [{ pageNumber: 1, fileUrl: 'k' }]
    })

    expect(res).toBe(created)
    const createArg = tx.name.create.mock.calls[0][0]
    expect(createArg.data.status).toBe(NameStatus.DRAFT)
    expect(createArg.data.submittedAt ?? null).toBeNull()
    expect(tx.chapter.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { nameId: 'n1' } })
  })
})
