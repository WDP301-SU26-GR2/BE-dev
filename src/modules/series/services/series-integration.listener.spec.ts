import { SeriesIntegrationListener } from './series-integration.listener'

const makeDeps = () => {
  const serialize = { serialize: jest.fn().mockResolvedValue(undefined) }
  const state = { transition: jest.fn().mockResolvedValue(undefined) }
  const repo = {
    findById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1' })
  }
  const notify = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const lifecycle = {
    cancel: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue(undefined),
    changeFormat: jest.fn().mockResolvedValue(undefined)
  }
  return { serialize, state, repo, notify, lifecycle }
}
const make = (d: ReturnType<typeof makeDeps>) =>
  new SeriesIntegrationListener(
    d.serialize as never,
    d.state as never,
    d.repo as never,
    d.notify as never,
    d.lifecycle as never
  )

describe('SeriesIntegrationListener.onBoardDecisionFinalized', () => {
  it('CANCELLATION + APPROVED → lifecycle.cancel with endingChapterAllowance from details', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'CANCELLATION',
      targetSeriesId: 's1',
      result: 'APPROVED',
      details: { endingChapterAllowance: 3 }
    })
    expect(d.lifecycle.cancel).toHaveBeenCalledWith('s1', 3)
  })

  it('COMPLETION + APPROVED → lifecycle.complete', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'COMPLETION',
      targetSeriesId: 's1',
      result: 'APPROVED',
      details: null
    })
    expect(d.lifecycle.complete).toHaveBeenCalledWith('s1')
  })

  it('FORMAT_CHANGE + APPROVED → lifecycle.changeFormat with publicationType from details', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'FORMAT_CHANGE',
      targetSeriesId: 's1',
      result: 'APPROVED',
      details: { publicationType: 'MONTHLY' }
    })
    expect(d.lifecycle.changeFormat).toHaveBeenCalledWith('s1', 'MONTHLY')
  })

  it('CANCELLATION + REJECTED → no-op', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'CANCELLATION',
      targetSeriesId: 's1',
      result: 'REJECTED',
      details: null
    })
    expect(d.lifecycle.cancel).not.toHaveBeenCalled()
  })

  it('SERIALIZATION + APPROVED → seriesSerializeService.serialize', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'SERIALIZATION',
      targetSeriesId: 's1',
      result: 'APPROVED',
      details: { magazine: 'WJ', startIssueNumber: 1, publicationType: 'WEEKLY' }
    })
    expect(d.serialize.serialize).toHaveBeenCalledWith('s1', {
      magazine: 'WJ',
      startIssueNumber: 1,
      publicationType: 'WEEKLY'
    })
  })

  it('SERIALIZATION + REJECTED → seriesStateService.transition to REJECTED', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'SERIALIZATION',
      targetSeriesId: 's1',
      result: 'REJECTED',
      details: null
    })
    expect(d.state.transition).toHaveBeenCalledWith('s1', 'REJECTED', expect.objectContaining({ changedBy: null }))
  })

  it('no targetSeriesId → no-op', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'CANCELLATION',
      targetSeriesId: null,
      result: 'APPROVED',
      details: null
    })
    expect(d.lifecycle.cancel).not.toHaveBeenCalled()
  })

  it('unknown decisionType → no-op', async () => {
    const d = makeDeps()
    await make(d).onBoardDecisionFinalized({
      decisionId: 'd1',
      decisionType: 'SOMETHING_ELSE' as never,
      targetSeriesId: 's1',
      result: 'APPROVED',
      details: null
    })
    expect(d.lifecycle.cancel).not.toHaveBeenCalled()
    expect(d.serialize.serialize).not.toHaveBeenCalled()
  })

  it('swallows exceptions (best-effort)', async () => {
    const d = makeDeps()
    d.lifecycle.cancel.mockRejectedValue(new Error('boom'))
    await expect(
      make(d).onBoardDecisionFinalized({
        decisionId: 'd1',
        decisionType: 'CANCELLATION',
        targetSeriesId: 's1',
        result: 'APPROVED',
        details: { endingChapterAllowance: 3 }
      })
    ).resolves.toBeUndefined() // listener MUST NOT throw
  })
})
