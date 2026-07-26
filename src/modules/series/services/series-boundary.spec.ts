import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SeriesLifecycleService } from './series-lifecycle.service'
import { SeriesProposalService } from './series-proposal.service'

describe('Series Phase-3 service boundaries', () => {
  it.each(['series-proposal.service.ts', 'series-lifecycle.service.ts'])('%s stays at or below 200 lines', (file) => {
    const lines = readFileSync(join(__dirname, file), 'utf8').split(/\r?\n/).length
    expect(lines).toBeLessThanOrEqual(200)
  })

  it('keeps orchestrator dependency counts within the architecture rule', () => {
    expect(SeriesProposalService.length).toBeLessThanOrEqual(6)
    expect(SeriesLifecycleService.length).toBeLessThanOrEqual(6)
  })
})
