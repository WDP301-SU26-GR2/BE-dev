import { computeAffectsSlot, resolveSide } from './deadline.constant'

describe('deadline constants', () => {
  it('resolves negotiation side from series ownership', () => {
    expect(resolveSide('mangaka-1', { mangakaId: 'mangaka-1', editorId: 'editor-1' })).toBe('MANGAKA')
    expect(resolveSide('editor-1', { mangakaId: 'mangaka-1', editorId: 'editor-1' })).toBe('EDITOR')
    expect(resolveSide('assistant-1', { mangakaId: 'mangaka-1', editorId: 'editor-1' })).toBeNull()
  })

  it('detects schedule slot impact only beyond the grace window', () => {
    const currentDeadline = new Date('2026-07-01T00:00:00.000Z')

    expect(computeAffectsSlot(currentDeadline, new Date('2026-07-03T00:00:00.000Z'), 48)).toBe(false)
    expect(computeAffectsSlot(currentDeadline, new Date('2026-07-03T00:00:01.000Z'), 48)).toBe(true)
    expect(computeAffectsSlot(null, new Date('2026-07-10T00:00:00.000Z'), 48)).toBe(false)
  })
})
