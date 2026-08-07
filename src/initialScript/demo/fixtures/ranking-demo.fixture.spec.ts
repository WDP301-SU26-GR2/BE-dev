import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Flow 4 ranking demo fixtures', () => {
  it('seeds a Super Admin operator for all survey-period operations', () => {
    const accounts = readFileSync(join(__dirname, '..', 'demo-data.ts'), 'utf8')
    const rankingFixture = readFileSync(join(__dirname, 'ranking-voting.fixture.ts'), 'utf8')

    expect(accounts).toContain("account('admin.hikari', 'Hikari Sato', RoleCode.SUPER_ADMIN")
    expect(rankingFixture).toContain("requiredAccount(context.accounts, 'admin.hikari')")
    expect(rankingFixture).not.toContain("requiredAccount(context.accounts, 'editor.duc')")
  })

  it('prepares a separate Monthly cohort with reflected, closed, and open vote periods', () => {
    const seedService = readFileSync(join(__dirname, '..', 'demo-seed.service.ts'), 'utf8')
    const seriesFixture = readFileSync(join(__dirname, 'series-flow.fixture.ts'), 'utf8')
    const rankingFixture = readFileSync(join(__dirname, 'ranking-voting.fixture.ts'), 'utf8')

    expect(seedService).toContain('seedMonthlyRankingRoster')
    expect(seriesFixture).toContain('PublicationType.MONTHLY')
    expect(seriesFixture).toContain('Manga Nexus Monthly')
    expect(rankingFixture).toContain('monthly')
    expect(rankingFixture).toContain('SurveyStatus.REFLECTED')
    expect(rankingFixture).toContain('SurveyStatus.CLOSED')
    expect(rankingFixture).toContain('SurveyStatus.OPEN')
  })
})
