import { fetchSeriesMiniMap, fetchUserMiniMap, toUserMini } from './user-mini.model'

describe('user-mini.model', () => {
  it('toUserMini fallback displayName ?? name, avatar ?? null', () => {
    expect(toUserMini({ id: 'u1', name: 'N', displayName: null, avatar: null })).toEqual({
      id: 'u1',
      displayName: 'N',
      avatar: null
    })
    expect(toUserMini({ id: 'u1', name: 'N', displayName: 'D', avatar: 'a.png' })).toEqual({
      id: 'u1',
      displayName: 'D',
      avatar: 'a.png'
    })
  })

  it('fetchUserMiniMap dedupes, ignores nullish ids, and skips empty queries', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'u1', name: 'N', displayName: null, avatar: null }])
    const prisma = { user: { findMany }, series: { findMany: jest.fn() } } as any
    const map = await fetchUserMiniMap(prisma, ['u1', 'u1', null, undefined])
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1'] } },
      select: { id: true, name: true, displayName: true, avatar: true }
    })
    expect(map.get('u1')).toEqual({ id: 'u1', displayName: 'N', avatar: null })
    expect((await fetchUserMiniMap(prisma, [null, undefined])).size).toBe(0)
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('fetchSeriesMiniMap returns an id-to-series-mini map', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 's1', title: 'T' }])
    const prisma = { user: { findMany: jest.fn() }, series: { findMany } } as any
    const map = await fetchSeriesMiniMap(prisma, ['s1'])
    expect(findMany).toHaveBeenCalledWith({ where: { id: { in: ['s1'] } }, select: { id: true, title: true } })
    expect(map.get('s1')).toEqual({ id: 's1', title: 'T' })
  })
})
