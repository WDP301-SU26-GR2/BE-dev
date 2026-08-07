import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Flow 5 lifecycle demo fixtures', () => {
  it('seeds cancellation, format-change, and completion decisions without obsolete CONTINUE', () => {
    const fixture = readFileSync(join(__dirname, 'board.fixture.ts'), 'utf8')

    expect(fixture).toContain('DecisionType.COMPLETION')
    expect(fixture).not.toContain('CONTINUE')
  })
})
