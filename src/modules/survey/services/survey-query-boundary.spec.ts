import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PublicVoteQueryService } from './public-vote-query.service'
import { RankingFinalizeService } from './ranking-finalize.service'

describe('Survey Phase-3 service boundaries', () => {
  it.each(['ranking-finalize.service.ts', 'public-vote-query.service.ts'])('%s stays at or below 200 lines', (file) => {
    const lines = readFileSync(join(__dirname, file), 'utf8').split(/\r?\n/).length
    expect(lines).toBeLessThanOrEqual(200)
  })

  it('keeps orchestrator dependency counts within the architecture rule', () => {
    expect(RankingFinalizeService.length).toBeLessThanOrEqual(6)
    expect(PublicVoteQueryService.length).toBeLessThanOrEqual(6)
  })
})
