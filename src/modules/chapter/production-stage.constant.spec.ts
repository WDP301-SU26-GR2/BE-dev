import { Specialization } from '@prisma/client'
import { DEFAULT_STAGE_TEMPLATE, STAGE_REGION_HINTS } from './production-stage.constant'

describe('production-stage constants', () => {
  it('defines the immutable four-stage default pipeline', () => {
    expect(DEFAULT_STAGE_TEMPLATE.map((stage) => stage.name)).toEqual([
      'INKING',
      'DETAILING',
      'LETTERING',
      'FINAL_CHECK'
    ])
    expect(DEFAULT_STAGE_TEMPLATE.map((stage) => stage.order)).toEqual([1, 2, 3, 4])
    expect(DEFAULT_STAGE_TEMPLATE[1].taskTypes).toEqual([
      Specialization.BACKGROUND,
      Specialization.SCREENTONE,
      Specialization.EFFECT_LINES,
      Specialization.COLORING
    ])
    expect(DEFAULT_STAGE_TEMPLATE[3]).toMatchObject({ isFinalCheck: true, taskTypes: [] })
  })

  it('provides hints only for known task-bearing default stages', () => {
    expect(STAGE_REGION_HINTS.INKING).toContain('CHARACTER')
    expect(STAGE_REGION_HINTS.DETAILING).toContain('SFX')
    expect(STAGE_REGION_HINTS.LETTERING).toEqual(['SPEECH_BUBBLE'])
  })
})
