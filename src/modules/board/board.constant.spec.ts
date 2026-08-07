import { BOARD_ROSTER_HARD_MAX, computeRosterCap } from './board.constant'

describe('computeRosterCap', () => {
  it('returns the configured size when it is odd and within the hard max', () => {
    expect(computeRosterCap(3)).toBe(3)
    expect(computeRosterCap(5)).toBe(5)
    expect(computeRosterCap(7)).toBe(7)
  })

  it('caps at the hard max of 9', () => {
    expect(BOARD_ROSTER_HARD_MAX).toBe(9)
    expect(computeRosterCap(9)).toBe(9)
    expect(computeRosterCap(11)).toBe(9)
    expect(computeRosterCap(100)).toBe(9)
  })

  it('rounds an even effective cap down to the nearest odd', () => {
    expect(computeRosterCap(4)).toBe(3)
    expect(computeRosterCap(8)).toBe(7)
    expect(computeRosterCap(10)).toBe(9)
  })
})
