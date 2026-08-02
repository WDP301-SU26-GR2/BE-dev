import { StoryboardStatus } from '@prisma/client'
import { StoryboardApprovalService } from './storyboard-approval.service'

describe('StoryboardApprovalService', () => {
  const sb = {
    id: 'sb-1',
    seriesId: 'series-1',
    chapterId: 'chapter-1',
    status: StoryboardStatus.DRAFT,
    version: 1,
    pages: [],
    submittedAt: null
  }

  it('exposes the minimal approval query shape', async () => {
    const repository = { findStoryboardById: jest.fn().mockResolvedValue(sb) }
    const service = new StoryboardApprovalService(repository as never)

    await expect(service.findApprovalById(sb.id)).resolves.toEqual({ status: StoryboardStatus.DRAFT })
  })

  it('owns chapter Storyboard status mutations', async () => {
    const repository = {
      updateStoryboardStatus: jest.fn().mockResolvedValue({
        ...sb,
        status: StoryboardStatus.SUBMITTED,
        submittedAt: new Date('2026-07-25T00:00:00.000Z')
      })
    }
    const service = new StoryboardApprovalService(repository as never)

    await expect(service.submitChapterStoryboard(sb.id)).resolves.toMatchObject({
      id: sb.id,
      status: StoryboardStatus.SUBMITTED,
      submittedAt: '2026-07-25T00:00:00.000Z'
    })
  })
})
