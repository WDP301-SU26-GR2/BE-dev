import { SeriesRequestStatus, SeriesRequestType, SeriesStatus } from '@prisma/client'
import {
  OpenSeriesRequestExistsException,
  SeriesRequestAccessDeniedException,
  SeriesRequestNotAllowedException
} from '../errors/series-request.errors'
import { SeriesRequestCreateService } from './series-request-create.service'

const MANGAKA = '507f1f77bcf86cd799439011'
const OTHER = '507f1f77bcf86cd799439012'
const SERIES = '507f1f77bcf86cd799439013'
const REQUEST_ID = '507f1f77bcf86cd799439014'

describe('SeriesRequestCreateService', () => {
  const makeDeps = (series: unknown, openRequest: unknown = null) => {
    const repo = {
      findOpenBySeries: jest.fn().mockResolvedValue(openRequest),
      create: jest.fn().mockResolvedValue({ id: REQUEST_ID, status: SeriesRequestStatus.PENDING }),
      findById: jest.fn()
    }
    const seriesRepo = { findById: jest.fn().mockResolvedValue(series) }
    const state = { transition: jest.fn().mockResolvedValue({ id: REQUEST_ID }) }
    const notify = { notifyOne: jest.fn().mockResolvedValue(undefined) }
    return { repo, seriesRepo, state, notify }
  }
  const build = (series: unknown, openRequest: unknown = null) => {
    const d = makeDeps(series, openRequest)
    return {
      ...d,
      service: new SeriesRequestCreateService(
        d.repo as never,
        d.seriesRepo as never,
        d.state as never,
        d.notify as never
      )
    }
  }

  const body = { seriesId: SERIES, requestType: SeriesRequestType.HIATUS, reason: 'kiệt sức' }

  beforeEach(() => jest.clearAllMocks())

  it('không phải chủ bộ truyện → 403', async () => {
    const { service } = build({ id: SERIES, mangakaId: OTHER, status: SeriesStatus.SERIALIZED })
    await expect(service.create(MANGAKA, body as never)).rejects.toBe(SeriesRequestAccessDeniedException)
  })

  it('HIATUS khi series DRAFT → 409', async () => {
    const { service } = build({ id: SERIES, mangakaId: MANGAKA, status: SeriesStatus.DRAFT })
    await expect(service.create(MANGAKA, body as never)).rejects.toBe(SeriesRequestNotAllowedException)
  })

  it('đã có request PENDING → 409', async () => {
    const { service } = build({ id: SERIES, mangakaId: MANGAKA, status: SeriesStatus.SERIALIZED }, { id: 'old' })
    await expect(service.create(MANGAKA, body as never)).rejects.toBe(OpenSeriesRequestExistsException)
  })

  it('hợp lệ → tạo request + notify biên tập viên phụ trách', async () => {
    const { repo, notify, service } = build({
      id: SERIES,
      mangakaId: MANGAKA,
      editorId: OTHER,
      status: SeriesStatus.SERIALIZED
    })
    await service.create(MANGAKA, body)
    expect(repo.create).toHaveBeenCalled()
    expect(notify.notifyOne).toHaveBeenCalledWith(OTHER, SERIES, 'SERIES_REQUEST_CREATED', expect.any(String))
  })

  it('WITHDRAW chỉ hợp lệ khi READY_TO_PITCH', async () => {
    const { service } = build({ id: SERIES, mangakaId: MANGAKA, status: SeriesStatus.READY_TO_PITCH })
    await expect(service.create(MANGAKA, { ...body, requestType: SeriesRequestType.WITHDRAW })).resolves.toBeDefined()
  })

  it('huỷ request của người khác → 403', async () => {
    const { repo, service } = build({ id: SERIES, mangakaId: MANGAKA, status: SeriesStatus.SERIALIZED })
    repo.findById.mockResolvedValue({ id: REQUEST_ID, requestedBy: OTHER, seriesId: SERIES, status: 'PENDING' })
    await expect(service.cancel(MANGAKA, REQUEST_ID)).rejects.toBe(SeriesRequestAccessDeniedException)
  })
})
