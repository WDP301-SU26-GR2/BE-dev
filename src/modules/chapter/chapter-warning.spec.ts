import { PublicationType } from '@prisma/client'
import { computeWarningLevel, WARNING_LEVEL } from './chapter.constant'

const NOW = new Date('2026-07-04T00:00:00Z')
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000)

describe('computeWarningLevel', () => {
  it('returns NONE when deadline is missing', () => {
    expect(computeWarningLevel(PublicationType.WEEKLY, null, 0, NOW)).toBe(WARNING_LEVEL.NONE)
  })

  it('returns CRITICAL when overdue regardless of progress', () => {
    expect(computeWarningLevel(PublicationType.WEEKLY, hoursFromNow(-1), 1, NOW)).toBe(WARNING_LEVEL.CRITICAL)
    expect(computeWarningLevel(PublicationType.MONTHLY, hoursFromNow(-100), 0.99, NOW)).toBe(WARNING_LEVEL.CRITICAL)
  })

  it('uses WEEKLY thresholds', () => {
    expect(computeWarningLevel(PublicationType.WEEKLY, hoursFromNow(20), 0.85, NOW)).toBe(WARNING_LEVEL.RED)
    expect(computeWarningLevel(PublicationType.WEEKLY, hoursFromNow(20), 0.95, NOW)).toBe(WARNING_LEVEL.NONE)
    expect(computeWarningLevel(PublicationType.WEEKLY, hoursFromNow(38), 0.6, NOW)).toBe(WARNING_LEVEL.YELLOW)
    expect(computeWarningLevel(PublicationType.WEEKLY, hoursFromNow(38), 0.75, NOW)).toBe(WARNING_LEVEL.NONE)
    expect(computeWarningLevel(PublicationType.WEEKLY, hoursFromNow(100), 0, NOW)).toBe(WARNING_LEVEL.NONE)
  })

  it('uses MONTHLY and IRREGULAR thresholds', () => {
    for (const publicationType of [PublicationType.MONTHLY, PublicationType.IRREGULAR]) {
      expect(computeWarningLevel(publicationType, hoursFromNow(40), 0.8, NOW)).toBe(WARNING_LEVEL.RED)
      expect(computeWarningLevel(publicationType, hoursFromNow(40), 0.9, NOW)).toBe(WARNING_LEVEL.NONE)
      expect(computeWarningLevel(publicationType, hoursFromNow(100), 0.5, NOW)).toBe(WARNING_LEVEL.YELLOW)
      expect(computeWarningLevel(publicationType, hoursFromNow(100), 0.7, NOW)).toBe(WARNING_LEVEL.NONE)
    }
  })

  it('uses MONTHLY thresholds when publication type is null', () => {
    expect(computeWarningLevel(null, hoursFromNow(40), 0.5, NOW)).toBe(WARNING_LEVEL.RED)
  })
})
