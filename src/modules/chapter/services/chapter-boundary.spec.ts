import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Chapter application-service boundaries', () => {
  it.each([
    ['production-stage.service.ts', 6],
    ['page.service.ts', 6],
    ['page-cleanup.service.ts', 6],
    [join('..', 'chapter.service.ts'), 6]
  ])('%s remains within size and dependency limits', (relativePath, maxDependencies) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const constructor = source.match(/constructor\s*\(([\s\S]*?)\)\s*\{/)
    const dependencies = constructor?.[1].match(/private readonly /g) ?? []

    expect(productionLines.length).toBeLessThanOrEqual(200)
    expect(dependencies.length).toBeLessThanOrEqual(maxDependencies)
  })
})
