import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ChapterRepository boundary', () => {
  it('remains a thin facade', () => {
    const source = readFileSync(join(__dirname, 'chapter.repo.ts'), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    expect(productionLines.length).toBeLessThanOrEqual(200)
  })
})
