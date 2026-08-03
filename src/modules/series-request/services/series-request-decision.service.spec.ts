import { SeriesRequestStatus, SeriesRequestType, SeriesStatus } from '@prisma/client'
import { SeriesRequestAccessDeniedException, SeriesRequestNotAllowedException } from '../errors/series-request.errors'
import { SeriesRequestDecisionService } from './series-request-decision.service'

const EDITOR = '507f1f77bcf86cd799439011'
const OTHER = '507f1f77bcf86cd799439012'
const SERIES = '507f1f77bcf86cd799439013'
const REQUEST_ID = '507f1f77bcf86cd799439014'
const MANGAKA = '507f1f77bcf86cd799439015'

describe('SeriesRequestDecisionService', () => {
  const build = (request: unknown, series: unknown) => {
    const repo = { findById: jest.fn().mockResolvedValue(request) }
    const seriesRepo = { findById: jest.fn().mockResolvedValue(series) }
    const state = { transition: jest.fn().mockResolvedValue({ id: REQUEST_ID }) }
    const seriesState = { transition: jest.fn().mockResolvedValue({ id: SERIES }) }
    const lifecycle = { hiatus: jest.fn().mockResolvedValue({ id: SERIES }) }
    const notify = { notifyOne: jest.fn().mockResolvedValue(undefined) }
    return {
      repo,
      state,
      seriesState,
      lifecycle,
      notify,
      service: new SeriesRequestDecisionService(
        repo as never,
        seriesRepo as never,
        state as never,
        seriesState as never,
        lifecycle as never,
        notify as never
      )
    }
  }

  const pending = (type: SeriesRequestType) => ({
    id: REQUEST_ID,
    seriesId: SERIES,
    requestType: type,
    status: SeriesRequestStatus.PENDING,
    requestedBy: MANGAKA,
    reason: 'kiệt sức',
    expectedReturnDate: null
  })

  beforeEach(() => jest.clearAllMocks())

  it('không phải biên tập viên phụ trách → 403', async () => {
    const { service } = build(pending(SeriesRequestType.HIATUS), {
      id: SERIES,
      editorId: OTHER,
      status: SeriesStatus.SERIALIZED
    })
    await expect(service.accept(EDITOR, REQUEST_ID, {})).rejects.toBe(SeriesRequestAccessDeniedException)
  })

  it('TOCTOU: series đã đổi trạng thái khi accept → 409', async () => {
    const { service } = build(pending(SeriesRequestType.HIATUS), {
      id: SERIES,
      editorId: EDITOR,
      status: SeriesStatus.CANCELLING
    })
    await expect(service.accept(EDITOR, REQUEST_ID, {})).rejects.toBe(SeriesRequestNotAllowedException)
  })

  it('accept WITHDRAW → chuyển series sang WITHDRAWN', async () => {
    const { seriesState, service } = build(pending(SeriesRequestType.WITHDRAW), {
      id: SERIES,
      editorId: EDITOR,
      status: SeriesStatus.READY_TO_PITCH
    })
    await service.accept(EDITOR, REQUEST_ID, {})
    expect(seriesState.transition).toHaveBeenCalledWith(SERIES, SeriesStatus.WITHDRAWN, expect.any(Object))
  })

  it('accept HIATUS → gọi lifecycle.hiatus, KHÔNG tự transition', async () => {
    const { lifecycle, seriesState, service } = build(pending(SeriesRequestType.HIATUS), {
      id: SERIES,
      editorId: EDITOR,
      status: SeriesStatus.SERIALIZED
    })
    await service.accept(EDITOR, REQUEST_ID, {})
    expect(lifecycle.hiatus).toHaveBeenCalled()
    expect(seriesState.transition).not.toHaveBeenCalled()
  })

  it('accept HIATUS: biên tập viên ghi đè ngày quay lại', async () => {
    const { lifecycle, service } = build(
      { ...pending(SeriesRequestType.HIATUS), expectedReturnDate: new Date('2026-09-01T00:00:00Z') },
      { id: SERIES, editorId: EDITOR, status: SeriesStatus.SERIALIZED }
    )
    await service.accept(EDITOR, REQUEST_ID, { expectedReturnDate: '2026-10-01T00:00:00.000Z' })
    expect(lifecycle.hiatus).toHaveBeenCalledWith(SERIES, EDITOR, expect.any(String), '2026-10-01T00:00:00.000Z')
  })

  it('accept COMPLETION → KHÔNG đổi trạng thái bộ truyện', async () => {
    const { seriesState, lifecycle, service } = build(pending(SeriesRequestType.COMPLETION), {
      id: SERIES,
      editorId: EDITOR,
      status: SeriesStatus.SERIALIZED
    })
    await service.accept(EDITOR, REQUEST_ID, {})
    expect(seriesState.transition).not.toHaveBeenCalled()
    expect(lifecycle.hiatus).not.toHaveBeenCalled()
  })

  it('reject → giữ nguyên trạng thái bộ truyện + lưu lý do', async () => {
    const { state, seriesState, service } = build(pending(SeriesRequestType.HIATUS), {
      id: SERIES,
      editorId: EDITOR,
      status: SeriesStatus.SERIALIZED
    })
    await service.reject(EDITOR, REQUEST_ID, { reason: 'chưa hợp lý' })
    expect(seriesState.transition).not.toHaveBeenCalled()
    expect(state.transition).toHaveBeenCalledWith(
      REQUEST_ID,
      SeriesRequestStatus.REJECTED,
      expect.objectContaining({ by: EDITOR })
    )
  })
})
