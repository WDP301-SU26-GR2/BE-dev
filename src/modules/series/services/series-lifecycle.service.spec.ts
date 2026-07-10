import { NotificationType, SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { SeriesLifecycleService } from './series-lifecycle.service'

const makeDeps = () => {
  const state = {
    transition: jest
      .fn()
      .mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.CANCELLING })
  }
  const repo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.SERIALIZED }),
    setEndingChapterAllowance: jest.fn().mockResolvedValue(undefined),
    setHiatusStartedAt: jest.fn().mockResolvedValue(undefined),
    updatePublicationType: jest.fn().mockResolvedValue(undefined),
    // PB-06
    setCompletionProposal: jest.fn().mockResolvedValue(undefined),
    findHiatusStartedBefore: jest.fn().mockResolvedValue([]),
    findBoardMemberIds: jest.fn().mockResolvedValue([])
  }
  const bus = { emit: jest.fn() }
  const notify = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  return { state, repo, bus, notify, audit }
}
const make = (d: ReturnType<typeof makeDeps>) =>
  new SeriesLifecycleService(d.state as never, d.repo as never, d.bus as never, d.notify as never, d.audit as never)

describe('SeriesLifecycleService.cancel', () => {
  it('transitions to CANCELLING, sets allowance, emits SeriesCancelling, notifies', async () => {
    const d = makeDeps()
    await make(d).cancel('s1', 3)
    expect(d.state.transition).toHaveBeenCalledWith(
      's1',
      SeriesStatus.CANCELLING,
      expect.objectContaining({ changedBy: null })
    )
    expect(d.repo.setEndingChapterAllowance).toHaveBeenCalledWith('s1', 3)
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesCancelling, { seriesId: 's1' })
    expect(d.notify.notifySafe).toHaveBeenCalledTimes(2)
    expect(d.notify.notifySafe.mock.calls[0][0]).toMatchObject({
      type: NotificationType.SYSTEM,
      referenceType: 'SERIES_CANCELLING'
    })
  })

  it('handles null allowance', async () => {
    const d = makeDeps()
    await make(d).cancel('s1')
    expect(d.repo.setEndingChapterAllowance).toHaveBeenCalledWith('s1', null)
  })
})

describe('SeriesLifecycleService.complete', () => {
  it('transitions to COMPLETING and notifies', async () => {
    const d = makeDeps()
    d.state.transition.mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.COMPLETING })
    await make(d).complete('s1')
    expect(d.state.transition).toHaveBeenCalledWith(
      's1',
      SeriesStatus.COMPLETING,
      expect.objectContaining({ changedBy: null })
    )
    expect(d.notify.notifySafe).toHaveBeenCalledTimes(2)
  })
})

describe('SeriesLifecycleService.complete — Spec 4 amendment wiring', () => {
  it('emits ContractAmendmentRequested (COMPLETION)', async () => {
    const d = makeDeps()
    d.state.transition.mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.COMPLETING })
    await make(d).complete('s1')
    expect(d.bus.emit).toHaveBeenCalledWith(
      DomainEvent.ContractAmendmentRequested,
      expect.objectContaining({ seriesId: 's1', trigger: 'COMPLETION' })
    )
  })
})

describe('SeriesLifecycleService.changeFormat', () => {
  it('updates publicationType without status transition', async () => {
    const d = makeDeps()
    await make(d).changeFormat('s1', 'MONTHLY')
    expect(d.repo.updatePublicationType).toHaveBeenCalledWith('s1', 'MONTHLY')
    expect(d.state.transition).not.toHaveBeenCalled()
  })
  it('skips update when publicationType missing', async () => {
    const d = makeDeps()
    await make(d).changeFormat('s1', undefined)
    expect(d.repo.updatePublicationType).not.toHaveBeenCalled()
  })
})

describe('SeriesLifecycleService.changeFormat — Spec 4 amendment wiring', () => {
  it('emits ContractAmendmentRequested (FORMAT_CHANGE) after publicationType change', async () => {
    const d = makeDeps()
    await make(d).changeFormat('s1', 'MONTHLY')
    expect(d.bus.emit).toHaveBeenCalledWith(
      DomainEvent.ContractAmendmentRequested,
      expect.objectContaining({ seriesId: 's1', trigger: 'FORMAT_CHANGE' })
    )
  })

  it('does NOT emit when publicationType missing (early return)', async () => {
    const d = makeDeps()
    await make(d).changeFormat('s1', undefined)
    expect(d.bus.emit).not.toHaveBeenCalledWith(DomainEvent.ContractAmendmentRequested, expect.anything())
  })
})

describe('SeriesLifecycleService.hiatus', () => {
  it('guards assigned editor, transitions to HIATUS, sets hiatusStartedAt, emits started', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.SERIALIZED
    })
    d.state.transition.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.HIATUS
    })
    await make(d).hiatus('0123456789abcdef01234567', 'e1', 'author sick')
    expect(d.state.transition).toHaveBeenCalledWith('0123456789abcdef01234567', SeriesStatus.HIATUS, {
      changedBy: 'e1',
      reason: 'author sick'
    })
    expect(d.repo.setHiatusStartedAt).toHaveBeenCalledWith('0123456789abcdef01234567', expect.any(Date))
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesHiatusStarted, { seriesId: '0123456789abcdef01234567' })
  })
  it('throws NotAssignedEditor when caller is not the series editor', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.SERIALIZED
    })
    await expect(make(d).hiatus('0123456789abcdef01234567', 'someone-else', 'x')).rejects.toThrow()
    expect(d.state.transition).not.toHaveBeenCalled()
  })
  it('throws SeriesNotFound for malformed id', async () => {
    const d = makeDeps()
    await expect(make(d).hiatus('bad-id', 'e1', 'x')).rejects.toThrow()
    expect(d.repo.findById).not.toHaveBeenCalled()
  })
})

describe('SeriesLifecycleService.resume', () => {
  it('computes pausedMs, transitions to SERIALIZED, clears hiatusStartedAt, emits ended', async () => {
    const d = makeDeps()
    const started = new Date(Date.now() - 60_000)
    d.repo.findById.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.HIATUS,
      hiatusStartedAt: started
    })
    d.state.transition.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.SERIALIZED
    })
    await make(d).resume('0123456789abcdef01234567', 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(
      '0123456789abcdef01234567',
      SeriesStatus.SERIALIZED,
      expect.objectContaining({ changedBy: 'e1' })
    )
    expect(d.repo.setHiatusStartedAt).toHaveBeenCalledWith('0123456789abcdef01234567', null)
    const emitCall = d.bus.emit.mock.calls.find((c) => c[0] === DomainEvent.SeriesHiatusEnded)
    expect(emitCall).toBeDefined()
    expect(emitCall[1].seriesId).toBe('0123456789abcdef01234567')
    expect(emitCall[1].pausedMs).toBeGreaterThanOrEqual(60_000 - 5_000)
  })
})

describe('SeriesLifecycleService.finalizeEnding', () => {
  it('CANCELLING → CANCELLED + emit SeriesCancelled', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.CANCELLING
    })
    d.state.transition.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.CANCELLED
    })
    await make(d).finalizeEnding('0123456789abcdef01234567', 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(
      '0123456789abcdef01234567',
      SeriesStatus.CANCELLED,
      expect.objectContaining({ changedBy: 'e1' })
    )
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesCancelled, {
      seriesId: '0123456789abcdef01234567'
    })
  })
  it('COMPLETING → COMPLETED', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.COMPLETING
    })
    d.state.transition.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.COMPLETED
    })
    await make(d).finalizeEnding('0123456789abcdef01234567', 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(
      '0123456789abcdef01234567',
      SeriesStatus.COMPLETED,
      expect.objectContaining({ changedBy: 'e1' })
    )
  })
  it('throws SeriesNotInEndingState when SERIALIZED', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: '0123456789abcdef01234567',
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.SERIALIZED
    })
    await expect(make(d).finalizeEnding('0123456789abcdef01234567', 'e1')).rejects.toThrow()
    expect(d.state.transition).not.toHaveBeenCalled()
  })
})

describe('SeriesLifecycleService.proposeCompletion (PB-06)', () => {
  const S = '0123456789abcdef01234567'
  it('malformed id → 404', async () => {
    const d = makeDeps()
    await expect(make(d).proposeCompletion('garbage', 'm1', 'MANGAKA', { reason: 'done' })).rejects.toMatchObject({
      status: 404
    })
  })
  it('non-participant → 403', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    await expect(make(d).proposeCompletion(S, 'xX', 'MANGAKA', { reason: 'done' })).rejects.toMatchObject({
      status: 403
    })
    expect(d.repo.setCompletionProposal).not.toHaveBeenCalled()
  })
  it('status not SERIALIZED/HIATUS → 409', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.PITCHED,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    await expect(make(d).proposeCompletion(S, 'm1', 'MANGAKA', { reason: 'done' })).rejects.toMatchObject({
      status: 409
    })
    expect(d.repo.setCompletionProposal).not.toHaveBeenCalled()
  })
  it('HIATUS status is proposable', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.HIATUS,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    d.repo.setCompletionProposal.mockResolvedValue({
      id: S,
      status: SeriesStatus.HIATUS,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    await make(d).proposeCompletion(S, 'm1', 'MANGAKA', { reason: 'done' })
    expect(d.repo.setCompletionProposal).toHaveBeenCalledWith(
      S,
      expect.objectContaining({ proposedByRole: 'MANGAKA', proposedById: 'm1', reason: 'done' })
    )
  })
  it('mangaka proposes on SERIALIZED → upsert proposal + notify editor', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    d.repo.setCompletionProposal.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      mangakaId: 'm1',
      editorId: 'e1',
      completionProposal: { reason: 'done' }
    })
    await make(d).proposeCompletion(S, 'm1', 'MANGAKA', { reason: 'done' })
    expect(d.repo.setCompletionProposal).toHaveBeenCalled()
    expect(d.notify.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'e1', referenceType: 'SERIES_COMPLETION_PROPOSED' })
    )
  })
  it('records audit COMPLETION_PROPOSED (Spec 9 §2.1 — proposal không đi qua state service nên phải audit riêng)', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({ id: S, status: SeriesStatus.SERIALIZED, mangakaId: 'm1', editorId: 'e1' })
    d.repo.setCompletionProposal.mockResolvedValue({ id: S, status: SeriesStatus.SERIALIZED, mangakaId: 'm1' })
    await make(d).proposeCompletion(S, 'm1', 'MANGAKA', { reason: 'story finished' })
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'm1',
        entityType: 'SERIES',
        entityId: S,
        action: 'COMPLETION_PROPOSED',
        reason: 'story finished'
      })
    )
  })
  it('editor proposes → notify mangaka', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    d.repo.setCompletionProposal.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      mangakaId: 'm1',
      editorId: 'e1'
    })
    await make(d).proposeCompletion(S, 'e1', 'EDITOR', { reason: 'done' })
    expect(d.notify.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'm1', referenceType: 'SERIES_COMPLETION_PROPOSED' })
    )
  })
})

describe('SeriesLifecycleService.forceCancel (PB-06)', () => {
  const S = '0123456789abcdef01234567'
  it('malformed id → 404', async () => {
    const d = makeDeps()
    await expect(make(d).forceCancel('garbage', 'e1')).rejects.toMatchObject({ status: 404 })
  })
  it('non-CANCELLING status → 409', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    await expect(make(d).forceCancel(S, 'e1')).rejects.toMatchObject({ status: 409 })
    expect(d.state.transition).not.toHaveBeenCalled()
  })
  it('non-assigned editor → 403', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.CANCELLING,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    await expect(make(d).forceCancel(S, 'eX')).rejects.toMatchObject({ status: 403 })
    expect(d.state.transition).not.toHaveBeenCalled()
  })
  it('CANCELLING + assigned editor → transition CANCELLED with reason + emit + notify', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.CANCELLING,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    d.state.transition.mockResolvedValue({
      id: S,
      status: SeriesStatus.CANCELLED,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    await make(d).forceCancel(S, 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(
      S,
      SeriesStatus.CANCELLED,
      expect.objectContaining({ changedBy: 'e1', reason: expect.stringContaining('without ending') })
    )
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesCancelled, { seriesId: S })
    expect(d.notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'SERIES_CANCELLED' }))
  })
})
