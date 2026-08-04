import { NotificationType, SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { SeriesMessages } from '../series.messages'
import { SeriesLifecycleService } from './series-lifecycle.service'
import { SeriesLifecycleNotificationService } from './series-lifecycle-notification.service'
import { SeriesCompletionProposalService } from './series-completion-proposal.service'
import { SeriesHiatusService } from './series-hiatus.service'

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
    countChaptersBySeriesId: jest.fn().mockResolvedValue(0),
    setHiatusStartedAt: jest.fn().mockResolvedValue(undefined),
    setHiatusStart: jest.fn().mockResolvedValue(undefined),
    clearHiatus: jest.fn().mockResolvedValue(undefined),
    updatePublicationType: jest.fn().mockResolvedValue(undefined),
    setCompletionProposal: jest.fn().mockResolvedValue(undefined),
    findHiatusStartedBefore: jest.fn().mockResolvedValue([]),
    findBoardMemberIds: jest.fn().mockResolvedValue([]),
    findActiveAssistantIdsBySeries: jest.fn().mockResolvedValue([])
  }
  const bus = { emit: jest.fn() }
  const notify = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const cascade = {
    holdAllForHiatus: jest.fn().mockResolvedValue([]),
    releaseAllForResume: jest.fn().mockResolvedValue([])
  }
  return { state, repo, bus, notify, audit, cascade }
}
const make = (d: ReturnType<typeof makeDeps>) => {
  const notifications = new SeriesLifecycleNotificationService(d.notify as never, d.repo as never)
  const completion = new SeriesCompletionProposalService(d.repo as never, d.audit as never, notifications)
  const hiatusService = new SeriesHiatusService(
    d.state as never,
    d.repo as never,
    notifications,
    d.cascade as never,
    d.bus as never
  )
  return new SeriesLifecycleService(
    d.state as never,
    d.repo as never,
    d.bus as never,
    notifications,
    completion,
    hiatusService
  )
}

describe('SeriesLifecycleService.cancel', () => {
  it('transitions to CANCELLING, sets allowance, emits SeriesCancelling, notifies', async () => {
    const d = makeDeps()
    d.repo.countChaptersBySeriesId.mockResolvedValue(0)
    await make(d).cancel('s1', 3)
    expect(d.state.transition).toHaveBeenCalledWith(
      's1',
      SeriesStatus.CANCELLING,
      expect.objectContaining({ changedBy: null })
    )
    expect(d.repo.countChaptersBySeriesId).toHaveBeenCalledWith('s1')
    expect(d.repo.setEndingChapterAllowance).toHaveBeenCalledWith('s1', 3, 0)
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesCancelling, { seriesId: 's1' })
    expect(d.notify.notifySafe).toHaveBeenCalledTimes(2)
    expect(d.notify.notifySafe.mock.calls[0][0]).toMatchObject({
      type: NotificationType.SYSTEM,
      referenceType: 'SERIES_CANCELLING'
    })
  })

  it('handles null allowance (snapshot vẫn lưu)', async () => {
    const d = makeDeps()
    d.repo.countChaptersBySeriesId.mockResolvedValue(2)
    await make(d).cancel('s1')
    expect(d.repo.countChaptersBySeriesId).toHaveBeenCalledWith('s1')
    expect(d.repo.setEndingChapterAllowance).toHaveBeenCalledWith('s1', null, 2)
  })

  it('snapshot count được đọc TRƯỚC transition (Fix-1 G-1)', async () => {
    const d = makeDeps()
    const callOrder: string[] = []
    d.repo.countChaptersBySeriesId.mockImplementation(() => {
      callOrder.push('count')
      return Promise.resolve(7)
    })
    d.state.transition.mockImplementation(() => {
      callOrder.push('transition')
      return Promise.resolve({ id: 's1', mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.CANCELLING })
    })
    d.repo.setEndingChapterAllowance.mockImplementation(() => {
      callOrder.push('set')
      return Promise.resolve(undefined)
    })
    await make(d).cancel('s1', 3)
    expect(callOrder).toEqual(['count', 'transition', 'set'])
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
    expect(d.notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'SERIES_COMPLETING' }))
  })
})

describe('SeriesLifecycleService.hiatus', () => {
  const S = '0123456789abcdef01234567'
  it('invalid id → 404', async () => {
    const d = makeDeps()
    await expect(make(d).hiatus('bad-id', 'e1', 'r')).rejects.toMatchObject({ status: 404 })
  })
  it('guards assigned editor, transitions to HIATUS, sets hiatusStartedAt, emits started', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({ id: S, mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.SERIALIZED })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.HIATUS, mangakaId: 'm1', editorId: 'e1' })
    await make(d).hiatus(S, 'e1', 'kiệt sức')
    expect(d.state.transition).toHaveBeenCalledWith(
      S,
      SeriesStatus.HIATUS,
      expect.objectContaining({ changedBy: 'e1' })
    )
    expect(d.repo.setHiatusStart).toHaveBeenCalledWith(S, expect.any(Date), null)
    expect(d.cascade.holdAllForHiatus).toHaveBeenCalled()
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesHiatusStarted, { seriesId: S })
    expect(d.notify.notifySafe).toHaveBeenCalled()
  })
  it('expectedReturnDate truyền xuống setHiatusStart', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({ id: S, mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.SERIALIZED })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.HIATUS, mangakaId: 'm1', editorId: 'e1' })
    await make(d).hiatus(S, 'e1', 'r', '2026-12-01T00:00:00.000Z')
    expect(d.repo.setHiatusStart).toHaveBeenCalledWith(S, expect.any(Date), new Date('2026-12-01T00:00:00.000Z'))
  })
  it('không phải editor phụ trách → 403', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({ id: S, mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.SERIALIZED })
    await expect(make(d).hiatus(S, 'eX', 'r')).rejects.toMatchObject({ status: 403 })
    expect(d.state.transition).not.toHaveBeenCalled()
  })
  it('holdAllForHiatus nhận actorId + reason từ messages', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({ id: S, mangakaId: 'm1', editorId: 'e1', status: SeriesStatus.SERIALIZED })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.HIATUS, mangakaId: 'm1', editorId: 'e1' })
    await make(d).hiatus(S, 'e1', 'r')
    expect(d.cascade.holdAllForHiatus).toHaveBeenCalledWith(S, 'e1', SeriesMessages.reason.hiatusHold)
  })
})

describe('SeriesLifecycleService.resume', () => {
  const S = '0123456789abcdef01234567'
  it('computes pausedMs, transitions to SERIALIZED, clears hiatusStartedAt, emits ended', async () => {
    const d = makeDeps()
    const start = new Date(Date.now() - 86_400_000)
    d.repo.findById.mockResolvedValue({
      id: S,
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.HIATUS,
      hiatusStartedAt: start
    })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.SERIALIZED, mangakaId: 'm1', editorId: 'e1' })
    await make(d).resume(S, 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(
      S,
      SeriesStatus.SERIALIZED,
      expect.objectContaining({ changedBy: 'e1' })
    )
    expect(d.repo.clearHiatus).toHaveBeenCalledWith(S)
    expect(d.cascade.releaseAllForResume).toHaveBeenCalledWith(S, 'e1', expect.any(Number))
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesHiatusEnded, {
      seriesId: S,
      pausedMs: expect.any(Number)
    })
    expect(d.notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'SERIES_RESUMED' }))
  })
  it('không có hiatusStartedAt → pausedMs=0', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      mangakaId: 'm1',
      editorId: 'e1',
      status: SeriesStatus.HIATUS,
      hiatusStartedAt: null
    })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.SERIALIZED, mangakaId: 'm1', editorId: 'e1' })
    await make(d).resume(S, 'e1')
    expect(d.cascade.releaseAllForResume).toHaveBeenCalledWith(S, 'e1', 0)
  })
})

describe('SeriesLifecycleService.finalizeEnding', () => {
  const S = '0123456789abcdef01234567'
  it('CANCELLING → CANCELLED + notify', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.CANCELLING,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.CANCELLED, editorId: 'e1', mangakaId: 'm1' })
    await make(d).finalizeEnding(S, 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(
      S,
      SeriesStatus.CANCELLED,
      expect.objectContaining({ changedBy: 'e1' })
    )
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesCancelled, { seriesId: S })
  })
  it('COMPLETING → COMPLETED + notify', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.COMPLETING,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    d.state.transition.mockResolvedValue({ id: S, status: SeriesStatus.COMPLETED, editorId: 'e1', mangakaId: 'm1' })
    await make(d).finalizeEnding(S, 'e1')
    expect(d.state.transition).toHaveBeenCalledWith(S, SeriesStatus.COMPLETED, expect.any(Object))
    expect(d.notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'SERIES_COMPLETED' }))
  })
  it('SERIALIZED → 409', async () => {
    const d = makeDeps()
    d.repo.findById.mockResolvedValue({
      id: S,
      status: SeriesStatus.SERIALIZED,
      editorId: 'e1',
      mangakaId: 'm1'
    })
    await expect(make(d).finalizeEnding(S, 'e1')).rejects.toMatchObject({ status: 409 })
    expect(d.state.transition).not.toHaveBeenCalled()
  })
})

describe('SeriesLifecycleService.changeFormat', () => {
  it('skipped when no publicationType (warn, no DB write)', async () => {
    const d = makeDeps()
    await make(d).changeFormat('s1')
    expect(d.repo.updatePublicationType).not.toHaveBeenCalled()
    expect(d.bus.emit).not.toHaveBeenCalled()
  })
})

describe('SeriesLifecycleService.proposeCompletion (PB-06)', () => {
  const S = '0123456789abcdef01234567'
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
      expect.objectContaining({ changedBy: 'e1', reason: expect.stringContaining('chưa có chương kết') })
    )
    expect(d.bus.emit).toHaveBeenCalledWith(DomainEvent.SeriesCancelled, { seriesId: S })
    expect(d.notify.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'SERIES_CANCELLED' }))
  })
})
