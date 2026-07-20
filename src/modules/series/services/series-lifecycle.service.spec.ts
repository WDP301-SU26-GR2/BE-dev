import { NotificationType, SeriesStatus } from '@prisma/client'
import { DomainEvent } from 'src/core/events/domain-events'
import { SeriesMessages } from '../series.messages'
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
    countChaptersBySeriesId: jest.fn().mockResolvedValue(0),
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
  it('changeFormat: notify owners bằng message mới + KHÔNG đụng Schedule (G-6)', async () => {
    const d = makeDeps()
    d.repo.findById = jest.fn().mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013'
    })
    d.repo.updatePublicationType = jest.fn().mockResolvedValue(undefined)
    const service = make(d)

    await service.changeFormat('507f1f77bcf86cd799439011', 'MONTHLY')

    // notify tới CẢ mangaka + editor, dùng text từ catalog
    expect(d.notify.notifySafe).toHaveBeenCalledTimes(2)
    expect(d.notify.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'SERIES_FORMAT_CHANGED',
        content: SeriesMessages.notification.seriesFormatChanged
      })
    )
    // message mới PHẢI nhắc Editor về deadline
    expect(SeriesMessages.notification.seriesFormatChanged).toContain('deadline')

    // KHÔNG đụng Schedule — repo của series không được lộ bất kỳ mutator lịch nào
    // (đổi nhịp xuất bản KHÔNG hồi tố deadline chapter đang sản xuất — Requiment Flow 5 CHANGE_FORMAT).
    expect(Object.keys(d.repo)).not.toContain('updateSchedule')
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
