import { computePageRenumber } from './chapter.constant'

// Task B: sau khi xoá page, dồn số các page còn lại về 1..N liên tục.
describe('computePageRenumber', () => {
  it('closes the gap left by a deleted middle page (1,2,4 → 4 becomes 3)', () => {
    const updates = computePageRenumber([
      { id: 'p1', pageNumber: 1 },
      { id: 'p2', pageNumber: 2 },
      { id: 'p4', pageNumber: 4 }
    ])
    expect(updates).toEqual([{ id: 'p4', pageNumber: 3 }])
  })

  it('returns no updates when pages are already sequential', () => {
    const updates = computePageRenumber([
      { id: 'p1', pageNumber: 1 },
      { id: 'p2', pageNumber: 2 },
      { id: 'p3', pageNumber: 3 }
    ])
    expect(updates).toEqual([])
  })

  it('renumbers a fully shifted set (2,3,5 → 1,2,3)', () => {
    const updates = computePageRenumber([
      { id: 'a', pageNumber: 2 },
      { id: 'b', pageNumber: 3 },
      { id: 'c', pageNumber: 5 }
    ])
    expect(updates).toEqual([
      { id: 'a', pageNumber: 1 },
      { id: 'b', pageNumber: 2 },
      { id: 'c', pageNumber: 3 }
    ])
  })

  it('sorts by current pageNumber before assigning, regardless of input order', () => {
    const updates = computePageRenumber([
      { id: 'c', pageNumber: 5 },
      { id: 'a', pageNumber: 2 },
      { id: 'b', pageNumber: 3 }
    ])
    expect(updates).toEqual([
      { id: 'a', pageNumber: 1 },
      { id: 'b', pageNumber: 2 },
      { id: 'c', pageNumber: 3 }
    ])
  })

  it('handles an empty chapter', () => {
    expect(computePageRenumber([])).toEqual([])
  })
})
