import { toDeadlineRequestListItem, toDeadlineRequestRes } from './deadline.mapper'

const request = {
  id: 'request-1',
  scheduleId: 'schedule-1',
  chapterId: 'chapter-1',
  seriesId: 'series-1',
  requestedBy: 'MANGAKA',
  lastProposedBy: 'EDITOR',
  currentDeadline: new Date('2026-07-01T00:00:00.000Z'),
  requestedDeadline: new Date('2026-07-03T00:00:00.000Z'),
  reason: 'Need more time',
  affectsSlot: false,
  status: 'PROPOSED',
  boardReviewedBy: null,
  resolvedAt: null,
  createdAt: new Date('2026-06-30T00:00:00.000Z'),
  series: { id: 'series-1', title: 'Series' },
  chapter: { id: 'chapter-1', chapterNumber: 1, title: 'Chapter 1' }
}

describe('deadline mapper', () => {
  it('maps dates/context and strips detail-only fields from the list item', () => {
    const result = toDeadlineRequestRes(request as never)
    expect(result).toMatchObject({ series: request.series, chapter: request.chapter })
    expect(result.currentDeadline).toBe('2026-07-01T00:00:00.000Z')

    const listItem = toDeadlineRequestListItem(request as never)
    for (const key of ['reason', 'boardReviewedBy', 'scheduleId', 'resolvedAt'])
      expect(listItem).not.toHaveProperty(key)
  })

  it('maps absent optional dates to null', () => {
    expect(toDeadlineRequestRes({ ...request, currentDeadline: null, resolvedAt: null } as never)).toMatchObject({
      currentDeadline: null,
      resolvedAt: null
    })
  })
})
