import { NameApprovedListener } from './name-approved.listener'

function make(seriesEditorId = 'e1') {
  const seriesRepository = { findById: jest.fn().mockResolvedValue({ id: 's1', editorId: seriesEditorId }) }
  const seriesStateService = { tryAdvanceToReadyToPitch: jest.fn().mockResolvedValue({}) }
  const listener = new NameApprovedListener(seriesRepository as never, seriesStateService as never)
  return { listener, seriesStateService, seriesRepository }
}

describe('NameApprovedListener', () => {
  it('PROPOSAL → tryAdvanceToReadyToPitch', async () => {
    const { listener, seriesStateService } = make()
    await listener.handle({ seriesId: 's1', nameId: 'n1', kind: 'PROPOSAL' })
    expect(seriesStateService.tryAdvanceToReadyToPitch).toHaveBeenCalledWith('s1', 'e1')
  })

  it('CHAPTER → no-op', async () => {
    const { listener, seriesStateService } = make()
    await listener.handle({ seriesId: 's1', nameId: 'n1', kind: 'CHAPTER' })
    expect(seriesStateService.tryAdvanceToReadyToPitch).not.toHaveBeenCalled()
  })
})
