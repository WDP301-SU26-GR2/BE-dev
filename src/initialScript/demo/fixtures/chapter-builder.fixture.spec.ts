import { ManuscriptStatus, StoryboardStatus } from '@prisma/client'
import { createChapterBundle } from './chapter-builder.fixture'

describe('createChapterBundle', () => {
  it('keeps a DRAFT chapter storyboard unsubmitted', async () => {
    const storyboardCreate = jest.fn().mockResolvedValue({ id: 'storyboard-1' })
    const context = {
      now: new Date('2026-08-07T00:00:00.000Z'),
      media: new Map([
        ['rough-drafting', { key: 'rough.webp' }],
        ['finished-line-art', { key: 'line.webp' }]
      ]),
      prisma: {
        chapter: { create: jest.fn().mockResolvedValue({ id: 'chapter-1' }), update: jest.fn() },
        storyboard: { create: storyboardCreate },
        manuscript: { create: jest.fn() },
        schedule: { create: jest.fn() },
        page: { create: jest.fn() }
      }
    }

    await createChapterBundle(context as never, { id: 'series-1', mangakaId: 'mangaka-1' } as never, {
      chapterNumber: 1,
      title: 'Draft storyboard',
      storyboardStatus: StoryboardStatus.DRAFT,
      manuscriptStatus: ManuscriptStatus.DRAFT,
      pageCount: 0
    })

    expect(storyboardCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: StoryboardStatus.DRAFT, submittedAt: null }) })
    )
  })
})
