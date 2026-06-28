import { Series } from '@prisma/client'
import { toSeriesRes } from './series.mapper'

const baseSeries = {
  id: 's1',
  mangakaId: 'm1',
  editorId: null,
  coOwnerId: null,
  parentSeriesId: null,
  title: 'T',
  coverImage: null,
  genre: null,
  demographic: null,
  publicationType: null,
  status: 'DRAFT',
  statusReason: null,
  relationshipType: null,
  coOwnerApprovalRequired: false,
  statusHistory: [],
  proposal: null,
  createdAt: new Date('2026-06-23T00:00:00.000Z')
} as unknown as Series

describe('toSeriesRes', () => {
  it('surfaces coverImage when set', () => {
    const res = toSeriesRes({ ...baseSeries, coverImage: 'uploads/m1/cover.png' })
    expect(res.coverImage).toBe('uploads/m1/cover.png')
  })

  it('returns null coverImage when unset', () => {
    const res = toSeriesRes(baseSeries)
    expect(res.coverImage).toBeNull()
  })
})
