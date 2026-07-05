import { ReputationService } from './reputation.service'

describe('ReputationService.compute', () => {
  const svc = new ReputationService()

  it('returns zeros when there are no reviews', () => {
    expect(svc.compute(0, 0, 4)).toEqual({ ratingAvg: 0, reputationScore: 0, isRecommended: false })
  })

  it('damps a single 5-star review below the raw mean and does not recommend (count<3)', () => {
    const r = svc.compute(5, 1, 4) // (5*3.5+5)/(5+1)=22.5/6=3.75
    expect(r.ratingAvg).toBe(5)
    expect(r.reputationScore).toBe(3.75)
    expect(r.isRecommended).toBe(false)
  })

  it('recommends when enough high reviews (count>=3 and score>=4.0)', () => {
    const r = svc.compute(24, 5, 4) // avg 4.8; (17.5+24)/10=4.15
    expect(r.ratingAvg).toBe(4.8)
    expect(r.reputationScore).toBe(4.15)
    expect(r.isRecommended).toBe(true)
  })

  it('does not recommend when score below threshold even if count ok', () => {
    const r = svc.compute(11, 3, 4) // avg 3.67; (17.5+11)/8=3.56
    expect(r.reputationScore).toBe(3.56)
    expect(r.isRecommended).toBe(false)
  })

  it('uses the configured recommendation threshold', () => {
    const r = svc.compute(24, 5, 4.2)
    expect(r.reputationScore).toBe(4.15)
    expect(r.isRecommended).toBe(false)
  })
})
