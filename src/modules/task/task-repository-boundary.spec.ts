import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('TaskRepository boundary', () => {
  it('remains a thin facade', () => {
    const source = readFileSync(join(__dirname, 'task.repo.ts'), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    expect(productionLines.length).toBeLessThanOrEqual(200)
  })
})
