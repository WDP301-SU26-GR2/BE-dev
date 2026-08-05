import { SeriesStatus } from '@prisma/client'
import { ChapterCreationService } from './chapter-creation.service'

function makeRepo() {
  return {
    findSeriesById: jest.fn(),
    findChapterByNumber: jest.fn(),
    countChaptersBySeriesId: jest.fn().mockResolvedValue(0),
    // BR-CONTRACT-05: mặc định series ĐÃ có hợp đồng hiệu lực để các case cũ giữ nguyên ý nghĩa.
    findExecutedContractBySeriesId: jest.fn().mockResolvedValue({ id: 'k1' }),
    findEverExecutedContractBySeriesId: jest.fn().mockResolvedValue({ id: 'k1' }),
    createChapter: jest
      .fn()
      .mockImplementation((d: Record<string, unknown>) =>
        Promise.resolve({ id: 'ch1', status: 'DRAFT', storyboardId: null, ...d })
      )
  }
}
const make = (repo: ReturnType<typeof makeRepo>) =>
  new ChapterCreationService(repo as unknown as ConstructorParameters<typeof ChapterCreationService>[0])
const S = '012345678901234567890123'

describe('ChapterCreationService.create (chapter-first)', () => {
  it('malformed seriesId → 404', async () => {
    const repo = makeRepo()
    await expect(make(repo).create('u', { seriesId: 'garbage', chapterNumber: 1 })).rejects.toMatchObject({
      status: 404
    })
    expect(repo.findSeriesById).not.toHaveBeenCalled()
  })

  it('not owner → 403', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'other', status: SeriesStatus.SERIALIZED })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 1 })).rejects.toMatchObject({
      status: 403
    })
  })

  it('series PITCHED → 409', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.PITCHED })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 1 })).rejects.toMatchObject({
      status: 409
    })
  })

  it('duplicate chapterNumber → 409', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.SERIALIZED })
    repo.findChapterByNumber.mockResolvedValue({ id: 'dup' })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 5 })).rejects.toMatchObject({
      status: 409
    })
  })

  it('valid → creates DRAFT chapter (storyboardId null)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.SERIALIZED })
    repo.findChapterByNumber.mockResolvedValue(null)
    const out = await make(repo).create('u', { seriesId: S, chapterNumber: 5, title: 'X' })
    expect(repo.createChapter).toHaveBeenCalledWith({ seriesId: S, chapterNumber: 5, title: 'X' })
    expect(out?.status).toBe('DRAFT')
  })
})

describe('ChapterCreationService.create — ending phase (Fix-1 G-1)', () => {
  it('CANCELLING + allowance null → creates ok, KHÔNG count query', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: null,
      chapterCountAtCancelling: 3
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await make(repo).create('u', { seriesId: S, chapterNumber: 4 })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
    expect(repo.createChapter).toHaveBeenCalled()
  })

  it('CANCELLING + snapshot null (legacy) → creates ok, không enforce', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: null
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 4 })).resolves.toBeDefined()
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
  })

  it('CANCELLING trong hạn allowance → creates ok', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: 3
    })
    repo.countChaptersBySeriesId.mockResolvedValue(4) // 4 - 3 = 1 < 2
    repo.findChapterByNumber.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 5 })).resolves.toBeDefined()
    expect(repo.createChapter).toHaveBeenCalled()
  })

  it('CANCELLING đạt trần allowance → 409 EndingAllowanceExceeded', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: 3
    })
    repo.countChaptersBySeriesId.mockResolvedValue(5) // 5 - 3 = 2 >= 2
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 6 })).rejects.toMatchObject({
      status: 409
    })
    expect(repo.createChapter).not.toHaveBeenCalled()
  })

  it('COMPLETING → creates ok, KHÔNG đếm (không áp trần)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.COMPLETING
    })
    repo.findChapterByNumber.mockResolvedValue(null)
    await make(repo).create('u', { seriesId: S, chapterNumber: 9 })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
    expect(repo.createChapter).toHaveBeenCalled()
  })

  it('HIATUS → 409 SeriesNotSerialized (vẫn chặn)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.HIATUS })
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 2 })).rejects.toMatchObject({
      status: 409
    })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
  })
})

// BR-CONTRACT-05 đẩy lên bước tạo chapter: không cho MỞ chương khi bộ truyện chưa có hợp đồng hiệu lực,
// thay vì để cả studio vẽ xong rồi mới chặn ở publish.
describe('ChapterCreationService.create — contract gate (BR-CONTRACT-05)', () => {
  it('SERIALIZED + chưa có hợp đồng FULLY_EXECUTED → 409 ContractNotExecuted, không tạo chapter', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.SERIALIZED })
    repo.findExecutedContractBySeriesId.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 1 })).rejects.toMatchObject({
      status: 409,
      response: { message: 'Error.ContractNotExecuted' }
    })
    expect(repo.createChapter).not.toHaveBeenCalled()
  })

  it('SERIALIZED dùng đúng nhánh strict (KHÔNG chấp nhận hợp đồng đã kết thúc)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.SERIALIZED })
    repo.findChapterByNumber.mockResolvedValue(null)
    await make(repo).create('u', { seriesId: S, chapterNumber: 1 })
    expect(repo.findExecutedContractBySeriesId).toHaveBeenCalledWith(S)
    expect(repo.findEverExecutedContractBySeriesId).not.toHaveBeenCalled()
  })

  it.each([SeriesStatus.CANCELLING, SeriesStatus.COMPLETING])(
    '%s + hợp đồng đã kết thúc hợp lệ (ever-executed) → vẫn tạo được chương kết thúc',
    async (status) => {
      const repo = makeRepo()
      repo.findSeriesById.mockResolvedValue({
        id: S,
        mangakaId: 'u',
        status,
        endingChapterAllowance: null,
        chapterCountAtCancelling: null
      })
      repo.findChapterByNumber.mockResolvedValue(null)
      // Hợp đồng KHÔNG còn FULLY_EXECUTED (cancel → payment engine TERMINATED) nhưng đã từng hiệu lực.
      repo.findExecutedContractBySeriesId.mockResolvedValue(null)
      await expect(make(repo).create('u', { seriesId: S, chapterNumber: 4 })).resolves.toBeDefined()
      expect(repo.findEverExecutedContractBySeriesId).toHaveBeenCalledWith(S)
      expect(repo.findExecutedContractBySeriesId).not.toHaveBeenCalled()
    }
  )

  it.each([SeriesStatus.CANCELLING, SeriesStatus.COMPLETING])(
    '%s + CHƯA TỪNG có hợp đồng → 409 (bịt lỗ ending-phase publish vô hạn)',
    async (status) => {
      const repo = makeRepo()
      repo.findSeriesById.mockResolvedValue({
        id: S,
        mangakaId: 'u',
        status,
        endingChapterAllowance: null,
        chapterCountAtCancelling: null
      })
      repo.findEverExecutedContractBySeriesId.mockResolvedValue(null)
      await expect(make(repo).create('u', { seriesId: S, chapterNumber: 4 })).rejects.toMatchObject({
        status: 409,
        response: { message: 'Error.ContractNotExecuted' }
      })
      expect(repo.createChapter).not.toHaveBeenCalled()
    }
  )

  it('gate hợp đồng chạy SAU kiểm trạng thái — HIATUS vẫn báo SeriesNotSerialized', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: S, mangakaId: 'u', status: SeriesStatus.HIATUS })
    repo.findExecutedContractBySeriesId.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 2 })).rejects.toMatchObject({
      response: { message: 'Error.SeriesNotSerialized' }
    })
    expect(repo.findExecutedContractBySeriesId).not.toHaveBeenCalled()
    expect(repo.findEverExecutedContractBySeriesId).not.toHaveBeenCalled()
  })

  it('gate hợp đồng chạy TRƯỚC kiểm trần allowance (không tốn count query)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({
      id: S,
      mangakaId: 'u',
      status: SeriesStatus.CANCELLING,
      endingChapterAllowance: 2,
      chapterCountAtCancelling: 3
    })
    repo.findEverExecutedContractBySeriesId.mockResolvedValue(null)
    await expect(make(repo).create('u', { seriesId: S, chapterNumber: 6 })).rejects.toMatchObject({ status: 409 })
    expect(repo.countChaptersBySeriesId).not.toHaveBeenCalled()
  })
})
