import { SeriesStatus } from '@prisma/client'
import { SeriesQueryService } from './series-query.service'
import { SeriesAccessDeniedException, SeriesNotFoundException } from '../errors/series.errors'

// ⚠️ id phải là ObjectId 24-hex hợp lệ — service guard OBJECT_ID_RE reject id rác trước khi gọi repo.
const SID = '507f1f77bcf86cd799439011'

function makeService() {
  const seriesRepository = {
    findSeriesForList: jest.fn(),
    countSeriesForList: jest.fn(),
    findById: jest.fn()
  }
  const service = new SeriesQueryService(seriesRepository as never)
  return { service, seriesRepository }
}

function seriesRow(over: Record<string, unknown> = {}) {
  return {
    id: SID,
    mangakaId: 'm1',
    editorId: null,
    coOwnerId: null,
    parentSeriesId: null,
    title: 'T',
    genres: [],
    demographic: null,
    publicationType: null,
    status: SeriesStatus.DRAFT,
    statusReason: null,
    relationshipType: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    proposal: null,
    ...over
  }
}

const mangaka = { userId: 'm1', roleName: 'MANGAKA' }
const editor = { userId: 'e1', roleName: 'EDITOR' }
const admin = { userId: 'a1', roleName: 'SUPER_ADMIN' }
const board = { userId: 'b1', roleName: 'BOARD_MEMBER' }

describe('SeriesQueryService.list', () => {
  it('MANGAKA → scope mangaka + paginated mapped result', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findSeriesForList.mockResolvedValue([seriesRow()])
    seriesRepository.countSeriesForList.mockResolvedValue(1)

    const res = await service.list(mangaka, { status: undefined, limit: 20, offset: 0 })

    const expectedFilter = { scope: { kind: 'mangaka', userId: 'm1' }, status: undefined }
    expect(seriesRepository.findSeriesForList).toHaveBeenCalledWith(expectedFilter, { limit: 20, offset: 0 })
    expect(seriesRepository.countSeriesForList).toHaveBeenCalledWith(expectedFilter)
    expect(res).toMatchObject({ total: 1, limit: 20, offset: 0 })
    expect(res.items[0]).toMatchObject({ id: SID, mangakaId: 'm1', createdAt: '2026-01-01T00:00:00.000Z' })
  })

  it('EDITOR → scope editor', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findSeriesForList.mockResolvedValue([])
    seriesRepository.countSeriesForList.mockResolvedValue(0)

    await service.list(editor, { status: SeriesStatus.IN_REVIEW, limit: 10, offset: 5 })

    expect(seriesRepository.findSeriesForList).toHaveBeenCalledWith(
      { scope: { kind: 'editor', userId: 'e1' }, status: SeriesStatus.IN_REVIEW },
      { limit: 10, offset: 5 }
    )
  })

  it('SUPER_ADMIN → scope all', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findSeriesForList.mockResolvedValue([])
    seriesRepository.countSeriesForList.mockResolvedValue(0)

    await service.list(admin, { status: undefined, limit: 20, offset: 0 })

    expect(seriesRepository.findSeriesForList).toHaveBeenCalledWith(
      { scope: { kind: 'all' }, status: undefined },
      { limit: 20, offset: 0 }
    )
  })
})

describe('SeriesQueryService.getById', () => {
  it('throws SeriesNotFoundException for malformed id without hitting repo', async () => {
    const { service, seriesRepository } = makeService()
    await expect(service.getById(mangaka, 'not-an-objectid')).rejects.toBe(SeriesNotFoundException)
    expect(seriesRepository.findById).not.toHaveBeenCalled()
  })

  it('throws SeriesNotFoundException when missing', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(null)
    await expect(service.getById(mangaka, SID)).rejects.toBe(SeriesNotFoundException)
  })

  it('MANGAKA owner → returns mapped', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'm1' }))
    const res = await service.getById(mangaka, SID)
    expect(res).toMatchObject({ id: SID })
  })

  it('MANGAKA non-owner → SeriesAccessDeniedException', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'other' }))
    await expect(service.getById(mangaka, SID)).rejects.toBe(SeriesAccessDeniedException)
  })

  it('EDITOR queue (editorId null + IN_REVIEW) → visible', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: null, status: SeriesStatus.IN_REVIEW }))
    const res = await service.getById(editor, SID)
    expect(res).toMatchObject({ id: SID })
  })

  it('EDITOR with series assigned to other editor → 403', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: 'other', status: SeriesStatus.IN_REVIEW }))
    await expect(service.getById(editor, SID)).rejects.toBe(SeriesAccessDeniedException)
  })

  it('SUPER_ADMIN cannot view DRAFT series detail', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ status: SeriesStatus.DRAFT }))

    await expect(service.getById(admin, SID)).rejects.toBe(SeriesAccessDeniedException)
  })

  it('BOARD_MEMBER cannot view WITHDRAWN series detail', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ status: SeriesStatus.WITHDRAWN }))

    await expect(service.getById(board, SID)).rejects.toBe(SeriesAccessDeniedException)
  })

  it('MANGAKA owner can still view own DRAFT series detail', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'm1', status: SeriesStatus.DRAFT }))

    const res = await service.getById(mangaka, SID)

    expect(res).toMatchObject({ id: SID, status: SeriesStatus.DRAFT })
  })

  it('assigned EDITOR can still view WITHDRAWN series detail', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ editorId: 'e1', status: SeriesStatus.WITHDRAWN }))

    const res = await service.getById(editor, SID)

    expect(res).toMatchObject({ id: SID, status: SeriesStatus.WITHDRAWN })
  })
})
