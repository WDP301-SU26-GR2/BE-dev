import { bottomThirdCount, computeRiskLevel, nextConsecutiveCount } from './ranking-finalize.helpers'

describe('ranking-finalize helpers (Spec 5 §3)', () => {
  it('bottomThirdCount = ceil(N/3)', () => {
    expect(bottomThirdCount(9)).toBe(3)
    expect(bottomThirdCount(10)).toBe(4)
    expect(bottomThirdCount(3)).toBe(1)
    expect(bottomThirdCount(0)).toBe(0)
  })

  it('computeRiskLevel maps consecutive count to tier', () => {
    expect(computeRiskLevel(false, 9)).toBe('NONE') // not at-risk → NONE regardless
    expect(computeRiskLevel(true, 1)).toBe('LOW')
    expect(computeRiskLevel(true, 2)).toBe('LOW')
    expect(computeRiskLevel(true, 3)).toBe('MEDIUM')
    expect(computeRiskLevel(true, 4)).toBe('MEDIUM')
    expect(computeRiskLevel(true, 5)).toBe('SEVERE')
    expect(computeRiskLevel(true, 10)).toBe('SEVERE')
  })

  it('nextConsecutiveCount: at-risk increments, else resets to 0', () => {
    expect(nextConsecutiveCount(2, true)).toBe(3)
    expect(nextConsecutiveCount(3, false)).toBe(0) // excluded/not-at-risk resets streak
    expect(nextConsecutiveCount(0, true)).toBe(1)
  })
})
