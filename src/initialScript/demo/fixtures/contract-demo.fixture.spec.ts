import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Flow 6 contract demo fixtures', () => {
  it('uses the representative two-phase workflow instead of obsolete CONTRACT board decisions', () => {
    const seriesFlow = readFileSync(join(__dirname, 'series-flow.fixture.ts'), 'utf8')
    const contractBuilder = readFileSync(join(__dirname, 'contract-builder.fixture.ts'), 'utf8')
    const verifier = readFileSync(join(__dirname, '..', 'demo-verify.ts'), 'utf8')
    const runbook = readFileSync(join(__dirname, '..', '..', 'DEMO-SEED-GUIDE.md'), 'utf8')

    expect(seriesFlow).not.toContain('createPendingPublicationContractDecision')
    expect(contractBuilder).not.toContain('DecisionType.CONTRACT')
    expect(contractBuilder).toContain('representativeId')
    expect(contractBuilder).toContain('ContractStatus.FULLY_EXECUTED')
    expect(verifier).not.toContain('validPendingContractDecisions')
    expect(runbook).not.toContain('pendingBoardDecisions=20')
  })
})
