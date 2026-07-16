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
  genres: [],
  demographic: null,
  publicationType: null,
  magazine: null,
  startIssueNumber: null,
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

  it('surfaces genres array + demographic', () => {
    const res = toSeriesRes({ ...baseSeries, genres: ['ACTION', 'DRAMA'], demographic: 'SEINEN' } as unknown as Series)
    expect(res.genres).toEqual(['ACTION', 'DRAMA'])
    expect(res.demographic).toBe('SEINEN')
  })

  it('surfaces serialization slot (magazine + startIssueNumber) when set', () => {
    const res = toSeriesRes({ ...baseSeries, magazine: 'Weekly Shonen', startIssueNumber: 5 })
    expect(res.magazine).toBe('Weekly Shonen')
    expect(res.startIssueNumber).toBe(5)
  })

  it('returns null slot fields when unset', () => {
    const res = toSeriesRes(baseSeries)
    expect(res.magazine).toBeNull()
    expect(res.startIssueNumber).toBeNull()
  })

  it('embeds mangaka/editor mini objects when relations are loaded', () => {
    const res = toSeriesRes({
      ...baseSeries,
      mangaka: { id: 'm1', name: 'Real Name', displayName: null, avatar: null },
      editor: { id: 'e1', name: 'E Name', displayName: 'E Display', avatar: 'a.png' }
    })
    expect((res as any).mangaka).toEqual({ id: 'm1', displayName: 'Real Name', avatar: null })
    expect((res as any).editor).toEqual({ id: 'e1', displayName: 'E Display', avatar: 'a.png' })
  })

  it('editor relation null (queue) → editor: null; relations absent (mutation path) → fields omitted', () => {
    const withNullEditor = toSeriesRes({
      ...baseSeries,
      mangaka: { id: 'm1', name: 'N', displayName: null, avatar: null },
      editor: null
    })
    expect((withNullEditor as any).editor).toBeNull()
    const plain = toSeriesRes(baseSeries)
    expect('mangaka' in plain).toBe(false)
    expect('editor' in plain).toBe(false)
  })
})
