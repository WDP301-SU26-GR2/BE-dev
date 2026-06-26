import { SeriesStatus } from '@prisma/client'
import { SeriesQueryService } from './series-query.service'
import { NameNotFoundException, SeriesAccessDeniedException, SeriesNotFoundException } from '../errors/series.errors'

// ⚠️ id phải là ObjectId 24-hex hợp lệ — service guard OBJECT_ID_RE reject id rác trước khi gọi repo.
const SID = '507f1f77bcf86cd799439011'
const NID = '507f1f77bcf86cd799439012'

function makeService() {
  const seriesRepository = {
    findSeriesForList: jest.fn(),
    countSeriesForList: jest.fn(),
    findById: jest.fn(),
    findNamesBySeriesId: jest.fn(),
    findNameById: jest.fn()
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
    genre: null,
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

function nameRow(over: Record<string, unknown> = {}) {
  return {
    id: NID,
    seriesId: SID,
    chapterNumber: null,
    status: 'DRAFT',
    version: 1,
    submittedAt: null,
    pages: [],
    ...over
  }
}

const mangaka = { userId: 'm1', roleName: 'MANGAKA' }
const editor = { userId: 'e1', roleName: 'EDITOR' }
const admin = { userId: 'a1', roleName: 'SUPER_ADMIN' }

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
})

describe('SeriesQueryService.listNames', () => {
  it('returns mapped items after visibility passes', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'm1' }))
    seriesRepository.findNamesBySeriesId.mockResolvedValue([nameRow()])
    const res = await service.listNames(mangaka, SID)
    expect(res.items[0]).toMatchObject({ id: NID, seriesId: SID })
  })
})

describe('SeriesQueryService.getName', () => {
  it('throws NameNotFoundException for malformed nameId', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'm1' }))
    await expect(service.getName(mangaka, SID, 'bad-name-id')).rejects.toBe(NameNotFoundException)
    expect(seriesRepository.findNameById).not.toHaveBeenCalled()
  })

  it('throws NameNotFoundException when name belongs to another series', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'm1' }))
    seriesRepository.findNameById.mockResolvedValue(nameRow({ seriesId: '507f1f77bcf86cd799439099' }))
    await expect(service.getName(mangaka, SID, NID)).rejects.toBe(NameNotFoundException)
  })

  it('returns mapped name when valid', async () => {
    const { service, seriesRepository } = makeService()
    seriesRepository.findById.mockResolvedValue(seriesRow({ mangakaId: 'm1' }))
    seriesRepository.findNameById.mockResolvedValue(nameRow({ seriesId: SID }))
    const res = await service.getName(mangaka, SID, NID)
    expect(res).toMatchObject({ id: NID, seriesId: SID })
  })
})
