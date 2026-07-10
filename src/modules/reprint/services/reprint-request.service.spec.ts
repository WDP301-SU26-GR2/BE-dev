import { ReprintRequestService } from './reprint-request.service'
import { ReprintRequestStateService } from './reprint-request-state.service'
import { RoleName } from 'src/core/security/constants/role.constant'

const REQ_ID = '012345678901234567890123'
const CH_ID = '0123456789abcdef01234567'

const stateServiceMock = () => ({
  assertTransition: jest.fn(),
  audit: jest.fn().mockResolvedValue(undefined)
})

function makeService(
  repo: any,
  ns: any = { notifySafe: jest.fn().mockResolvedValue(undefined) },
  audit: any = { record: jest.fn().mockResolvedValue(undefined) }
) {
  return new ReprintRequestService(repo as never, ns as never, audit as never, stateServiceMock() as never)
}

describe('ReprintRequestService', () => {
  it('publishes the request when all chapters are approved (auto-publish via approveChapter)', async () => {
    const repo = {
      findActiveContractBySeriesId: jest
        .fn()
        .mockResolvedValue({ id: 'c1', contractType: 'FULL_BUYOUT', mangakaId: 'm1' }),
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        requestedBy: 'u1',
        status: 'BOARD_APPROVED',
        chapters: [{ originalChapterId: CH_ID, status: 'READY' }]
      }),
      update: jest.fn().mockImplementation((_id: string, patch: any) => Promise.resolve({ id: REQ_ID, ...patch }))
    }
    const stateService = stateServiceMock()
    const service = new ReprintRequestService(
      repo as never,
      { notifySafe: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      stateService as never
    )

    await service.approveChapter(REQ_ID, CH_ID, { originalChapterId: CH_ID, approve: true }, 'editor-1')

    expect(repo.update).toHaveBeenCalledWith(REQ_ID, expect.objectContaining({ status: 'PUBLISHED' }))
    expect(stateService.assertTransition).toHaveBeenCalledWith('BOARD_APPROVED', 'PUBLISHED')
    expect(stateService.audit).toHaveBeenCalledWith(
      REQ_ID,
      'BOARD_APPROVED',
      'PUBLISHED',
      'editor-1',
      'all chapters approved'
    )
  })

  it('rejects malformed request id on findById with 404 (no 500)', async () => {
    const repo = { findById: jest.fn() }
    const service = makeService(repo)
    await expect(service.findById('garbage')).rejects.toMatchObject({ status: 404 })
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('rejects malformed request id on getChapters with 404 (no 500)', async () => {
    const repo = { findById: jest.fn() }
    const service = makeService(repo)
    await expect(service.getChapters('garbage')).rejects.toMatchObject({ status: 404 })
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('rejects malformed id on getChapterById with 404 (no 500)', async () => {
    const repo = { findById: jest.fn() }
    const service = makeService(repo)
    await expect(service.getChapterById('garbage', CH_ID)).rejects.toMatchObject({ status: 404 })
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('rejects malformed chapterId on getChapterById with 404', async () => {
    const repo = { findById: jest.fn() }
    const service = makeService(repo)
    await expect(service.getChapterById(REQ_ID, 'garbage')).rejects.toMatchObject({ status: 404 })
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('updateChapterManuscript marks chapter READY and notifies', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        status: 'BOARD_APPROVED',
        requestedBy: 'editor-1',
        chapters: [{ originalChapterId: CH_ID, status: 'PENDING', manuscriptFile: null }]
      }),
      update: jest.fn().mockResolvedValue({ id: REQ_ID, chapters: [{ originalChapterId: CH_ID, status: 'READY' }] })
    }
    const ns = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const service = makeService(repo, ns)

    await service.updateChapterManuscript(REQ_ID, CH_ID, { originalChapterId: CH_ID, manuscriptFile: 'm.pdf' }, 'm1')

    const patched = repo.update.mock.calls[0][1].chapters
    expect(patched[0].status).toBe('READY')
    expect(patched[0].manuscriptFile).toBe('m.pdf')
    expect(ns.notifySafe).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'REPRINT_CHAPTER_SUBMITTED' }))
  })

  it('approveChapter with approve=false marks chapter IN_REVISION and does NOT publish', async () => {
    const repo = {
      findActiveContractBySeriesId: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        status: 'BOARD_APPROVED',
        requestedBy: 'editor-1',
        chapters: [
          { originalChapterId: CH_ID, status: 'READY' },
          { originalChapterId: '0123456789abcdef01234599', status: 'READY' }
        ]
      }),
      update: jest.fn().mockResolvedValue({ id: REQ_ID })
    }
    const stateService = stateServiceMock()
    const service = new ReprintRequestService(
      repo as never,
      { notifySafe: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      stateService as never
    )

    await service.approveChapter(REQ_ID, CH_ID, { originalChapterId: CH_ID, approve: false }, 'editor-1')

    expect(stateService.assertTransition).not.toHaveBeenCalled()
    expect(stateService.audit).not.toHaveBeenCalled()
    const patched = repo.update.mock.calls[0][1].chapters
    expect(patched[0].status).toBe('IN_REVISION')
  })

  it('approveChapter rejects with InvalidReprintTransition when status not BOARD_APPROVED/APPROVED', async () => {
    const repo = {
      findActiveContractBySeriesId: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        status: 'PENDING',
        requestedBy: 'editor-1',
        chapters: [{ originalChapterId: CH_ID, status: 'READY' }]
      }),
      update: jest.fn()
    }
    const service = makeService(repo)
    await expect(
      service.approveChapter(REQ_ID, CH_ID, { originalChapterId: CH_ID, approve: true }, 'editor-1')
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('ReprintRequestService.findAll scoping', () => {
  const repo = { findManyScoped: jest.fn().mockResolvedValue([]) } as any
  const service = makeService(repo)

  it('BOARD_MEMBER -> all (passes roleName to repo)', async () => {
    await service.findAll('u1', RoleName.BOARD_MEMBER, {})
    expect(repo.findManyScoped).toHaveBeenCalledWith({
      userId: 'u1',
      roleName: RoleName.BOARD_MEMBER,
      status: undefined,
      seriesId: undefined
    })
  })
  it('MANGAKA -> scoped (passes roleName to repo)', async () => {
    await service.findAll('m1', RoleName.MANGAKA, {})
    expect(repo.findManyScoped).toHaveBeenCalledWith({
      userId: 'm1',
      roleName: RoleName.MANGAKA,
      status: undefined,
      seriesId: undefined
    })
  })
  it('EDITOR -> scoped (passes roleName to repo)', async () => {
    await service.findAll('editor-1', RoleName.EDITOR, {})
    expect(repo.findManyScoped).toHaveBeenCalledWith({
      userId: 'editor-1',
      roleName: RoleName.EDITOR,
      status: undefined,
      seriesId: undefined
    })
  })
})

describe('ReprintRequestService.assignReviser (PB-07)', () => {
  function baseRepo() {
    return {
      findById: jest.fn(),
      findActiveContractBySeriesId: jest.fn(),
      findUserRole: jest.fn(),
      update: jest.fn().mockImplementation((_id: string, patch: any) => Promise.resolve({ id: REQ_ID, ...patch }))
    }
  }
  function make(repo: any) {
    return makeService(repo)
  }
  function baseRequest(repo: any, revisionMode = 'WITH_REVISION') {
    repo.findById.mockResolvedValue({
      id: REQ_ID,
      seriesId: 's1',
      revisionMode,
      status: 'BOARD_APPROVED',
      chapters: [{ originalChapterId: CH_ID, status: 'READY' }]
    })
  }
  it('REVENUE_SHARE contract -> 409 (reviser only FULL_BUYOUT)', async () => {
    const repo = baseRepo()
    baseRequest(repo)
    repo.findActiveContractBySeriesId.mockResolvedValue({ contractType: 'REVENUE_SHARE', mangakaId: 'm1' })
    const svc = make(repo)
    await expect(
      svc.assignReviser(REQ_ID, CH_ID, { reviserId: 'u2', reviserType: 'INTERNAL_TEAM' }, 'admin')
    ).rejects.toMatchObject({ status: 409 })
  })

  it('AS_IS mode -> 409 (not WITH_REVISION)', async () => {
    const repo = baseRepo()
    baseRequest(repo, 'AS_IS')
    repo.findActiveContractBySeriesId.mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: 'm1' })
    const svc = make(repo)
    await expect(
      svc.assignReviser(REQ_ID, CH_ID, { reviserId: 'u2', reviserType: 'INTERNAL_TEAM' }, 'admin')
    ).rejects.toMatchObject({ status: 409 })
  })

  it('FULL_BUYOUT + WITH_REVISION + INTERNAL_TEAM -> sets reviser', async () => {
    const repo = baseRepo()
    baseRequest(repo)
    repo.findActiveContractBySeriesId.mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: 'm1' })
    const svc = make(repo)
    await svc.assignReviser(REQ_ID, CH_ID, { reviserId: 'u2', reviserType: 'INTERNAL_TEAM' }, 'admin')
    const patchedChapters = repo.update.mock.calls[0][1].chapters
    expect(patchedChapters[0].reviserId).toBe('u2')
    expect(patchedChapters[0].reviserType).toBe('INTERNAL_TEAM')
  })
  it('OTHER_MANGAKA reviser not a mangaka -> 422', async () => {
    const repo = baseRepo()
    baseRequest(repo)
    repo.findActiveContractBySeriesId.mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: 'm1' })
    repo.findUserRole.mockResolvedValue({ id: 'r1', role: { code: 'EDITOR' } })
    const svc = make(repo)
    await expect(
      svc.assignReviser(REQ_ID, CH_ID, { reviserId: 'r1', reviserType: 'OTHER_MANGAKA' }, 'admin')
    ).rejects.toMatchObject({ status: 422 })
  })

  it('OTHER_MANGAKA reviser is a mangaka -> success', async () => {
    const repo = baseRepo()
    baseRequest(repo)
    repo.findActiveContractBySeriesId.mockResolvedValue({ contractType: 'FULL_BUYOUT', mangakaId: 'm1' })
    repo.findUserRole.mockResolvedValue({ id: 'm2', role: { code: 'MANGAKA' } })
    const svc = make(repo)
    await svc.assignReviser(REQ_ID, CH_ID, { reviserId: 'm2', reviserType: 'OTHER_MANGAKA' }, 'admin')
    const patchedChapters = repo.update.mock.calls[0][1].chapters
    expect(patchedChapters[0].reviserType).toBe('OTHER_MANGAKA')
  })

  it('malformed reprint id -> 404 (no 500)', async () => {
    const repo = baseRepo()
    const svc = make(repo)
    await expect(
      svc.assignReviser('garbage', CH_ID, { reviserId: 'x', reviserType: 'INTERNAL_TEAM' }, 'admin')
    ).rejects.toMatchObject({ status: 404 })
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('malformed chapter id -> 404 (no 500)', async () => {
    const repo = baseRepo()
    const svc = make(repo)
    await expect(
      svc.assignReviser(REQ_ID, 'garbage', { reviserId: 'x', reviserType: 'INTERNAL_TEAM' }, 'admin')
    ).rejects.toMatchObject({ status: 404 })
    expect(repo.findById).not.toHaveBeenCalled()
  })
})

describe('ReprintRequestService state-service wiring (B-RPT-02)', () => {
  it('mangakaReview accepts → assertTransition(PENDING → MANGAKA_APPROVED) + audit', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        requestedBy: 'editor-1',
        status: 'PENDING',
        chapters: []
      }),
      findActiveContractBySeriesId: jest.fn().mockResolvedValue({ contractType: 'REVENUE_SHARE', mangakaId: 'm1' }),
      update: jest.fn().mockResolvedValue({ id: REQ_ID, status: 'MANGAKA_APPROVED' })
    }
    const stateService = stateServiceMock()
    const service = new ReprintRequestService(
      repo as never,
      { notifySafe: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      stateService as never
    )
    await service.mangakaReview(REQ_ID, { accept: true }, 'm1')
    expect(stateService.assertTransition).toHaveBeenCalledWith('PENDING', 'MANGAKA_APPROVED')
    expect(stateService.audit).toHaveBeenCalledWith(
      REQ_ID,
      'PENDING',
      'MANGAKA_APPROVED',
      'm1',
      'mangaka review accepted'
    )
  })

  it('boardApprove rejects → assertTransition(PENDING → REJECTED) + audit', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        requestedBy: 'editor-1',
        status: 'PENDING',
        chapters: []
      }),
      findActiveContractBySeriesId: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: REQ_ID, status: 'REJECTED' })
    }
    const stateService = stateServiceMock()
    const service = new ReprintRequestService(
      repo as never,
      { notifySafe: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      stateService as never
    )
    await service.boardApprove(REQ_ID, { approve: false }, 'board-1')
    expect(stateService.assertTransition).toHaveBeenCalledWith('PENDING', 'REJECTED')
    expect(stateService.audit).toHaveBeenCalledWith(REQ_ID, 'PENDING', 'REJECTED', 'board-1', 'board rejected')
  })

  it('mangakaReview rejects → REJECTED_BY_MANGAKA (B-RPT-02 AC2, not board REJECTED)', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        requestedBy: 'editor-1',
        status: 'PENDING',
        chapters: []
      }),
      findActiveContractBySeriesId: jest.fn().mockResolvedValue({ contractType: 'REVENUE_SHARE', mangakaId: 'm1' }),
      update: jest.fn().mockResolvedValue({ id: REQ_ID, status: 'REJECTED_BY_MANGAKA' })
    }
    const stateService = stateServiceMock()
    const service = new ReprintRequestService(
      repo as never,
      { notifySafe: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      stateService as never
    )
    await service.mangakaReview(REQ_ID, { accept: false }, 'm1')
    expect(repo.update).toHaveBeenCalledWith(REQ_ID, { status: 'REJECTED_BY_MANGAKA' })
    expect(stateService.assertTransition).toHaveBeenCalledWith('PENDING', 'REJECTED_BY_MANGAKA')
  })

  // Regression guard cho blindspot mock: chạy với ReprintRequestStateService THẬT để chắc chắn
  // bảng transition thực sự cho phép mangaka accept từ PENDING (trước đây mock che mất 409 runtime).
  it('mangakaReview accepts with REAL state service (no InvalidReprintTransition)', async () => {
    const realState = new ReprintRequestStateService({ record: jest.fn().mockResolvedValue(undefined) } as never)
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: REQ_ID,
        seriesId: 's1',
        requestedBy: 'editor-1',
        status: 'PENDING',
        chapters: []
      }),
      findActiveContractBySeriesId: jest.fn().mockResolvedValue({ contractType: 'REVENUE_SHARE', mangakaId: 'm1' }),
      update: jest.fn().mockResolvedValue({ id: REQ_ID, status: 'MANGAKA_APPROVED' })
    }
    const service = new ReprintRequestService(
      repo as never,
      { notifySafe: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      realState
    )
    await expect(service.mangakaReview(REQ_ID, { accept: true }, 'm1')).resolves.toMatchObject({
      status: 'MANGAKA_APPROVED'
    })
  })
})
