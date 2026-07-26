import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ReprintRequestFacade architecture boundary', () => {
  it('remains a thin orchestrator over focused query/chapter/workflow services', () => {
    const source = readFileSync(join(__dirname, 'reprint-request.facade.ts'), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const injectedDependencies = source.match(/private readonly /g) ?? []

    expect(productionLines.length).toBeLessThanOrEqual(200)
    expect(injectedDependencies.length).toBeLessThanOrEqual(6)
    expect(source).toContain('ReprintQueryService')
    expect(source).toContain('ReprintChapterService')
    expect(source).toContain('ReprintWorkflowService')
    expect(source).not.toContain('reprintRequestRepo.update(')
  })

  it.each([
    'reprint-query.service.ts',
    'reprint-chapter.service.ts',
    'reprint-workflow.service.ts',
    'reprint-creation.service.ts',
    'reprint-review.service.ts',
    'reprint-assignment.service.ts'
  ])('%s stays within the service size and dependency limits', (fileName) => {
    const source = readFileSync(join(__dirname, fileName), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const injectedDependencies = source.match(/private readonly /g) ?? []

    expect(productionLines.length).toBeLessThanOrEqual(200)
    expect(injectedDependencies.length).toBeLessThanOrEqual(6)
  })
})
