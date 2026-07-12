import { BoardRosterService } from './board-roster.service'
import { NotEnoughBoardMembersException, SeriesNotFoundException } from '../errors/board.errors'

const SERIES_ID = '012345678901234567890123'

const member = (id: string, genres: string[] | null, createdAt: string) => ({
  id,
  displayName: 'm' + id,
  avatar: null,
  createdAt: new Date(createdAt),
  staffProfile: genres ? { specialtyGenres: genres } : null
})

function makeDeps() {
  return {
    repo: {
      findSeriesGenres: jest.fn().mockResolvedValue({ id: SERIES_ID, genres: ['ACTION', 'FANTASY'] }),
      findRoleIdByCode: jest.fn().mockResolvedValue('roleid'),
      findActiveBoardMembers: jest.fn().mockResolvedValue([]),
      getActiveConfig: jest.fn().mockResolvedValue({ quorumMin: 0 })
    }
  }
}
const make = (d: any) => new BoardRosterService(d.repo)

describe('BoardRosterService.suggest', () => {
  it('ranks by number of matched genres, descending', async () => {
    const d = makeDeps()
    d.repo.findActiveBoardMembers.mockResolvedValue([
      member('a', ['ROMANCE'], '2020-01-01'),
      member('b', ['ACTION', 'FANTASY'], '2020-01-01'),
      member('c', ['ACTION'], '2020-01-01')
    ])
    const out = await make(d).suggest(SERIES_ID)
    expect(out.items.map((i) => i.userId)).toEqual(['b', 'c', 'a'])
    expect(out.items[0].matchedGenres).toEqual(['ACTION', 'FANTASY'])
    expect(out.items[0].score).toBe(2)
  })

  it('is deterministic: ties break by hasProfile, then createdAt, then id', async () => {
    const d = makeDeps()
    d.repo.findActiveBoardMembers.mockResolvedValue([
      member('z', null, '2020-01-01'),
      member('y', [], '2021-01-01'),
      member('x', [], '2020-06-01')
    ])
    const out = await make(d).suggest(SERIES_ID)
    expect(out.items.map((i) => i.userId)).toEqual(['x', 'y', 'z'])
  })

  it('always returns an ODD roster of at least 3', async () => {
    const d = makeDeps()
    d.repo.findActiveBoardMembers.mockResolvedValue(
      ['a', 'b', 'c', 'd', 'e'].map((id) => member(id, ['ACTION'], '2020-01-01'))
    )
    const out = await make(d).suggest(SERIES_ID)
    expect(out.size).toBe(3)
    expect(out.items).toHaveLength(3)
  })

  it('rounds an even requested size UP to odd', async () => {
    const d = makeDeps()
    d.repo.findActiveBoardMembers.mockResolvedValue(
      ['a', 'b', 'c', 'd', 'e'].map((id) => member(id, ['ACTION'], '2020-01-01'))
    )
    const out = await make(d).suggest(SERIES_ID, 4)
    expect(out.size).toBe(5)
  })

  it('caps the roster at the largest odd number <= available', async () => {
    const d = makeDeps()
    d.repo.findActiveBoardMembers.mockResolvedValue(
      ['a', 'b', 'c', 'd'].map((id) => member(id, ['ACTION'], '2020-01-01'))
    )
    const out = await make(d).suggest(SERIES_ID, 9)
    expect(out.size).toBe(3) // 4 available → largest odd <= 4 is 3
  })

  it('throws when fewer than 3 active board members exist', async () => {
    const d = makeDeps()
    d.repo.findActiveBoardMembers.mockResolvedValue([member('a', ['ACTION'], '2020-01-01')])
    await expect(make(d).suggest(SERIES_ID)).rejects.toBe(NotEnoughBoardMembersException)
  })

  it('throws 404 for a malformed seriesId without touching the repo', async () => {
    const d = makeDeps()
    await expect(make(d).suggest('garbage')).rejects.toBe(SeriesNotFoundException)
    expect(d.repo.findSeriesGenres).not.toHaveBeenCalled()
  })

  it('throws 404 when the series does not exist', async () => {
    const d = makeDeps()
    d.repo.findSeriesGenres.mockResolvedValue(null)
    await expect(make(d).suggest(SERIES_ID)).rejects.toBe(SeriesNotFoundException)
  })
})
