import { ManuscriptStatus, NameStatus } from '@prisma/client'
import {
  ChapterAccessDeniedException,
  ChapterNotFoundException,
  DuplicatePageNumberException,
  NotSeriesOwnerException,
  PageHasApprovedTasksException,
  PageNotEditableException,
  PageNotFoundException
} from '../errors/chapter.errors'
import { DeletePagesBulkBodySchema, UpdatePageBodySchema } from '../schemas/chapter-schemas'
import { PageService } from './page.service'

function makeDeps(over: Record<string, unknown> = {}) {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', nameId: 'n1' }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
    findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.DRAFT }),
    createPage: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: 'DRAFT' }),
    findPageById: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: 'DRAFT' }),
    findPagesByChapterId: jest.fn().mockResolvedValue([]),
    updatePage: jest.fn().mockResolvedValue({ id: 'p1' }),
    findPageByChapterAndNumber: jest.fn().mockResolvedValue(null),
    findNameStatus: jest.fn().mockResolvedValue(NameStatus.APPROVED),
    ...over
  }
  const manuscriptState = { transition: jest.fn().mockResolvedValue({}) }
  return { repo, manuscriptState }
}

function makeStudio(activeAssignment: unknown = null) {
  return { findActiveForPair: jest.fn().mockResolvedValue(activeAssignment) }
}

function makeNotification() {
  return { notifySafe: jest.fn().mockResolvedValue(undefined) }
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

function makeStorage() {
  return { deleteObject: jest.fn().mockResolvedValue(undefined) }
}

describe('PageService.createPage', () => {
  it('creates page and moves Manuscript DRAFT→IN_PRODUCTION on first page', async () => {
    const { repo, manuscriptState } = makeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    const result = await svc.createPage('u1', 'c1', { pageNumber: 1, originalFile: 'uploads/u1/a.png' })
    expect(result.status).toBe('DRAFT')
    expect(repo.createPage).toHaveBeenCalledWith('c1', { pageNumber: 1, originalFile: 'uploads/u1/a.png' })
    expect(manuscriptState.transition).toHaveBeenCalledWith('c1', ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })
  })

  it('does not transition when manuscript already IN_PRODUCTION', async () => {
    const { repo, manuscriptState } = makeDeps({
      findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.IN_PRODUCTION })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await svc.createPage('u1', 'c1', { pageNumber: 2, originalFile: 'k' })
    expect(manuscriptState.transition).not.toHaveBeenCalled()
  })

  it('non-owner cannot create page (403)', async () => {
    const { repo, manuscriptState } = makeDeps({
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.createPage('u1', 'c1', { pageNumber: 1, originalFile: 'k' })).rejects.toBeDefined()
  })

  it('updatePage only writes compositeFile and has no status transition path', async () => {
    const { repo, manuscriptState } = makeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await svc.updatePage('u1', 'p1', { compositeFile: 'k2' })
    expect(repo.updatePage).toHaveBeenCalledWith('p1', { compositeFile: 'k2' })
  })

  it('updatePage rejects a COMPLETED page after owner and hold checks', async () => {
    const { repo, manuscriptState } = makeDeps({
      findPageById: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', status: 'COMPLETED' })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await expect(svc.updatePage('u1', 'p1', { compositeFile: 'k2' })).rejects.toBe(PageNotEditableException)
    expect(repo.findChapterById).toHaveBeenCalledWith('c1')
    expect(repo.updatePage).not.toHaveBeenCalled()
  })

  it.each(['DRAFT', 'REVISING'])('updatePage allows editable status %s', async (status) => {
    const { repo, manuscriptState } = makeDeps({
      findPageById: jest
        .fn()
        .mockResolvedValueOnce({ id: 'p1', chapterId: 'c1', status })
        .mockResolvedValueOnce({ id: 'p1', chapterId: 'c1', status, compositeFile: 'k2' })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await expect(svc.updatePage('u1', 'p1', { compositeFile: 'k2' })).resolves.toMatchObject({ status })
    expect(repo.updatePage).toHaveBeenCalledWith('p1', { compositeFile: 'k2' })
  })
})

describe('PageService.deletePage', () => {
  const PG = '012345678901234567890123'

  function makeDeleteDeps(over: Record<string, unknown> = {}) {
    const repo = {
      findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
      findPageById: jest.fn().mockResolvedValue({ id: PG, chapterId: 'c1', status: 'DRAFT' }),
      findTasksByPage: jest.fn().mockResolvedValue([]),
      deletePageCascade: jest.fn().mockResolvedValue({ deletedRegions: 0, deletedTasks: 0 }),
      ...over
    }
    const manuscriptState = { transition: jest.fn() }
    const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const storage = makeStorage()
    return { repo, manuscriptState, notification, audit, storage }
  }

  function makeSvc(d: ReturnType<typeof makeDeleteDeps>) {
    return new PageService(
      d.repo as never,
      d.manuscriptState as never,
      makeStudio() as never,
      d.notification as never,
      d.audit as never,
      d.storage as never
    )
  }

  it('deletes an editable page together with its regions and tasks', async () => {
    const d = makeDeleteDeps({
      findTasksByPage: jest.fn().mockResolvedValue([{ id: 't1', status: 'ASSIGNED', assistantId: 'a1' }]),
      deletePageCascade: jest.fn().mockResolvedValue({ deletedRegions: 2, deletedTasks: 1 })
    })

    const result = await makeSvc(d).deletePage('u1', PG)

    expect(d.repo.deletePageCascade).toHaveBeenCalledWith('c1', PG)
    expect(result).toEqual({ pageId: PG, deletedRegions: 2, deletedTasks: 1 })
  })

  it('notifies each assistant whose task is removed', async () => {
    const d = makeDeleteDeps({
      findTasksByPage: jest.fn().mockResolvedValue([
        { id: 't1', status: 'ASSIGNED', assistantId: 'a1' },
        { id: 't2', status: 'IN_PROGRESS', assistantId: 'a2' },
        { id: 't3', status: 'ASSIGNED', assistantId: null }
      ])
    })

    await makeSvc(d).deletePage('u1', PG)

    expect(d.notification.notifySafe).toHaveBeenCalledTimes(2)
    expect(d.notification.notifySafe.mock.calls[0][0]).toMatchObject({ recipientId: 'a1', referenceId: 't1' })
    expect(d.notification.notifySafe.mock.calls[1][0]).toMatchObject({ recipientId: 'a2', referenceId: 't2' })
  })

  it('records an audit trail for the cascade', async () => {
    const d = makeDeleteDeps()
    await makeSvc(d).deletePage('u1', PG)
    expect(d.audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'u1', entityId: PG }))
  })

  // Đồng bộ PA-03: xoá Region bị CHẶN khi có task APPROVED (công trợ lý đã được duyệt).
  // Xoá Page cũng phải chặn, nếu không sẽ có đường vòng xoá mất công đã duyệt.
  it('refuses to delete a page that has an APPROVED task', async () => {
    const d = makeDeleteDeps({
      findTasksByPage: jest.fn().mockResolvedValue([
        { id: 't1', status: 'ASSIGNED', assistantId: 'a1' },
        { id: 't2', status: 'APPROVED', assistantId: 'a2' }
      ])
    })

    await expect(makeSvc(d).deletePage('u1', PG)).rejects.toBe(PageHasApprovedTasksException)
    expect(d.repo.deletePageCascade).not.toHaveBeenCalled()
  })

  it('still deletes when tasks exist but none is APPROVED', async () => {
    const d = makeDeleteDeps({
      findTasksByPage: jest.fn().mockResolvedValue([
        { id: 't1', status: 'REVISION_REQUESTED', assistantId: 'a1' },
        { id: 't2', status: 'CANCELLED', assistantId: 'a2' }
      ])
    })

    await expect(makeSvc(d).deletePage('u1', PG)).resolves.toBeDefined()
    expect(d.repo.deletePageCascade).toHaveBeenCalledWith('c1', PG)
  })

  it('refuses to delete a COMPLETED page', async () => {
    const d = makeDeleteDeps({
      findPageById: jest.fn().mockResolvedValue({ id: PG, chapterId: 'c1', status: 'COMPLETED' })
    })

    await expect(makeSvc(d).deletePage('u1', PG)).rejects.toBe(PageNotEditableException)
    expect(d.repo.deletePageCascade).not.toHaveBeenCalled()
  })

  it('refuses a non-owner', async () => {
    const d = makeDeleteDeps({ findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' }) })
    await expect(makeSvc(d).deletePage('u1', PG)).rejects.toBe(NotSeriesOwnerException)
    expect(d.repo.deletePageCascade).not.toHaveBeenCalled()
  })

  it('yields 404 for a malformed page id without hitting the database', async () => {
    const d = makeDeleteDeps()
    await expect(makeSvc(d).deletePage('u1', 'bad-id')).rejects.toBe(PageNotFoundException)
    expect(d.repo.findPageById).not.toHaveBeenCalled()
  })

  it('yields 404 for an unknown page', async () => {
    const d = makeDeleteDeps({ findPageById: jest.fn().mockResolvedValue(null) })
    await expect(makeSvc(d).deletePage('u1', PG)).rejects.toBe(PageNotFoundException)
  })

  // Task C: xoá page → dọn file vật lý trên R2 (bản gốc + composite), tránh orphan bucket.
  it('deletes the R2 objects for both originalFile and compositeFile', async () => {
    const d = makeDeleteDeps({
      findPageById: jest.fn().mockResolvedValue({
        id: PG,
        chapterId: 'c1',
        status: 'DRAFT',
        originalFile: 'orig-key',
        compositeFile: 'comp-key'
      })
    })
    await makeSvc(d).deletePage('u1', PG)
    expect(d.storage.deleteObject).toHaveBeenCalledWith('orig-key')
    expect(d.storage.deleteObject).toHaveBeenCalledWith('comp-key')
  })

  it('deletes only originalFile when there is no compositeFile', async () => {
    const d = makeDeleteDeps({
      findPageById: jest
        .fn()
        .mockResolvedValue({ id: PG, chapterId: 'c1', status: 'DRAFT', originalFile: 'orig-key', compositeFile: null })
    })
    await makeSvc(d).deletePage('u1', PG)
    expect(d.storage.deleteObject).toHaveBeenCalledTimes(1)
    expect(d.storage.deleteObject).toHaveBeenCalledWith('orig-key')
  })

  // R2 cleanup là best-effort (side-effect sau commit) — lỗi R2 KHÔNG được phá việc xoá page đã commit.
  it('still succeeds when R2 deleteObject throws (best-effort)', async () => {
    const d = makeDeleteDeps({
      findPageById: jest
        .fn()
        .mockResolvedValue({ id: PG, chapterId: 'c1', status: 'DRAFT', originalFile: 'orig-key', compositeFile: null })
    })
    d.storage.deleteObject = jest.fn().mockRejectedValue(new Error('R2 down'))
    await expect(makeSvc(d).deletePage('u1', PG)).resolves.toBeDefined()
    expect(d.repo.deletePageCascade).toHaveBeenCalled()
  })
})

describe('PageService.deletePagesBulk', () => {
  const P1 = '012345678901234567890123'
  const P2 = '012345678901234567890124'
  const CH = '0123456789012345678901ff'

  function makeBulkDeps(over: Record<string, unknown> = {}) {
    const repo = {
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
      findPagesByIds: jest.fn().mockResolvedValue([
        { id: P1, chapterId: CH, status: 'DRAFT' },
        { id: P2, chapterId: CH, status: 'DRAFT' }
      ]),
      findTasksByPages: jest.fn().mockResolvedValue([]),
      deletePagesCascade: jest.fn().mockResolvedValue({ deletedRegions: 0, deletedTasks: 0 }),
      ...over
    }
    const manuscriptState = { transition: jest.fn() }
    const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const storage = makeStorage()
    return { repo, manuscriptState, notification, audit, storage }
  }

  function makeSvc(d: ReturnType<typeof makeBulkDeps>) {
    return new PageService(
      d.repo as never,
      d.manuscriptState as never,
      makeStudio() as never,
      d.notification as never,
      d.audit as never,
      d.storage as never
    )
  }

  it('deletes every requested page in one cascade call', async () => {
    const d = makeBulkDeps({ deletePagesCascade: jest.fn().mockResolvedValue({ deletedRegions: 3, deletedTasks: 2 }) })

    const result = await makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1, P2] })

    expect(d.repo.deletePagesCascade).toHaveBeenCalledWith(CH, [P1, P2])
    expect(result).toEqual({ deletedPages: 2, deletedRegions: 3, deletedTasks: 2 })
  })

  it('is all-or-nothing when one page belongs to another chapter', async () => {
    const d = makeBulkDeps({
      findPagesByIds: jest.fn().mockResolvedValue([
        { id: P1, chapterId: CH, status: 'DRAFT' },
        { id: P2, chapterId: 'other-chapter', status: 'DRAFT' }
      ])
    })

    await expect(makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1, P2] })).rejects.toBe(PageNotFoundException)
    expect(d.repo.deletePagesCascade).not.toHaveBeenCalled()
  })

  it('is all-or-nothing when any page is missing', async () => {
    const d = makeBulkDeps({
      findPagesByIds: jest.fn().mockResolvedValue([{ id: P1, chapterId: CH, status: 'DRAFT' }])
    })

    await expect(makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1, P2] })).rejects.toBe(PageNotFoundException)
    expect(d.repo.deletePagesCascade).not.toHaveBeenCalled()
  })

  it('is all-or-nothing when any page is COMPLETED', async () => {
    const d = makeBulkDeps({
      findPagesByIds: jest.fn().mockResolvedValue([
        { id: P1, chapterId: CH, status: 'DRAFT' },
        { id: P2, chapterId: CH, status: 'COMPLETED' }
      ])
    })

    await expect(makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1, P2] })).rejects.toBe(PageNotEditableException)
    expect(d.repo.deletePagesCascade).not.toHaveBeenCalled()
  })

  it('is all-or-nothing when any page has an APPROVED task', async () => {
    const d = makeBulkDeps({
      findTasksByPages: jest.fn().mockResolvedValue([{ id: 't1', pageId: P2, status: 'APPROVED', assistantId: 'a1' }])
    })

    await expect(makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1, P2] })).rejects.toBe(
      PageHasApprovedTasksException
    )
    expect(d.repo.deletePagesCascade).not.toHaveBeenCalled()
  })

  it('refuses a non-owner before reading pages', async () => {
    const d = makeBulkDeps({ findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'someone' }) })
    await expect(makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1] })).rejects.toBe(NotSeriesOwnerException)
    expect(d.repo.deletePagesCascade).not.toHaveBeenCalled()
  })

  // Task C: bulk xoá cũng dọn R2 cho mọi key (bản gốc + composite) của mọi page bị xoá.
  it('deletes the R2 objects for every removed page', async () => {
    const d = makeBulkDeps({
      findPagesByIds: jest.fn().mockResolvedValue([
        { id: P1, chapterId: CH, status: 'DRAFT', originalFile: 'o1', compositeFile: 'c1key' },
        { id: P2, chapterId: CH, status: 'DRAFT', originalFile: 'o2', compositeFile: null }
      ])
    })
    await makeSvc(d).deletePagesBulk('u1', CH, { pageIds: [P1, P2] })
    expect(d.storage.deleteObject).toHaveBeenCalledWith('o1')
    expect(d.storage.deleteObject).toHaveBeenCalledWith('c1key')
    expect(d.storage.deleteObject).toHaveBeenCalledWith('o2')
    expect(d.storage.deleteObject).toHaveBeenCalledTimes(3)
  })
})

describe('DeletePagesBulkBodySchema', () => {
  const ID = '012345678901234567890123'

  it('requires at least one page id', () => {
    expect(DeletePagesBulkBodySchema.safeParse({ pageIds: [] }).success).toBe(false)
  })

  it('caps the batch at 50 ids', () => {
    const ids = Array.from({ length: 51 }, () => ID)
    expect(DeletePagesBulkBodySchema.safeParse({ pageIds: ids }).success).toBe(false)
  })

  it('accepts a batch of 50', () => {
    const ids = Array.from({ length: 50 }, () => ID)
    expect(DeletePagesBulkBodySchema.safeParse({ pageIds: ids }).success).toBe(true)
  })
})

// BR-AUTH-00: GET /chapters/:id/pages trước đây là AUTH-only không scoping
// → mọi user đăng nhập đọc được originalFile của mọi chapter.
describe('PageService.listPages scoping', () => {
  const CH = '012345678901234567890123'

  function makeScopeDeps(over: Record<string, unknown> = {}, activeAssignment: unknown = null) {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'mangaka', editorId: 'editor' }),
      findPagesByChapterId: jest.fn().mockResolvedValue([{ id: 'p1', chapterId: CH, status: 'DRAFT' }]),
      ...over
    })
    const studioAssignment = { findActiveForPair: jest.fn().mockResolvedValue(activeAssignment) }
    return { repo, manuscriptState, studioAssignment }
  }

  it('owning mangaka can list pages', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('mangaka', 'MANGAKA', CH)).resolves.toHaveLength(1)
  })

  it('a different mangaka is denied', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('other-mangaka', 'MANGAKA', CH)).rejects.toBe(ChapterAccessDeniedException)
  })

  it('assigned editor can list pages', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('editor', 'EDITOR', CH)).resolves.toHaveLength(1)
  })

  it('an editor who does not own the series is denied', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('other-editor', 'EDITOR', CH)).rejects.toBe(ChapterAccessDeniedException)
  })

  it('assistant with an active studio assignment can list pages (BR-ASSIST-01)', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps({}, { id: 'sa1', status: 'ACTIVE' })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await expect(svc.listPages('assistant', 'ASSISTANT', CH)).resolves.toHaveLength(1)
    expect(studioAssignment.findActiveForPair).toHaveBeenCalledWith('mangaka', 'assistant')
  })

  it('assistant without an active assignment is denied', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps({}, null)
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('assistant', 'ASSISTANT', CH)).rejects.toBe(ChapterAccessDeniedException)
  })

  it.each(['BOARD_MEMBER', 'SUPER_ADMIN'])('%s has full read access', async (roleName) => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('oversight', roleName, CH)).resolves.toHaveLength(1)
  })

  it('malformed chapter id yields 404 before any scope lookup', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await expect(svc.listPages('mangaka', 'MANGAKA', 'not-an-object-id')).rejects.toBe(ChapterNotFoundException)
    expect(repo.findChapterById).not.toHaveBeenCalled()
  })

  it('unknown chapter yields 404', async () => {
    const { repo, manuscriptState, studioAssignment } = makeScopeDeps({
      findChapterById: jest.fn().mockResolvedValue(null)
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      studioAssignment as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.listPages('mangaka', 'MANGAKA', CH)).rejects.toBe(ChapterNotFoundException)
  })
})

describe('UpdatePageBodySchema', () => {
  it('strictly rejects the removed client-controlled status field', () => {
    expect(UpdatePageBodySchema.safeParse({ status: 'DRAFT' }).success).toBe(false)
  })

  // originalFile là NGUỒN cho AI segment + Assistant workspace → không cho PATCH đè.
  // Thay bản gốc = xoá trang rồi upload lại (DELETE /pages/:pageId).
  it('rejects originalFile — bản gốc chỉ set lúc tạo trang', () => {
    expect(UpdatePageBodySchema.safeParse({ originalFile: 'uploads/u1/redraw.png' }).success).toBe(false)
  })

  it('accepts pageNumber so a mangaka can renumber a page', () => {
    expect(UpdatePageBodySchema.safeParse({ pageNumber: 4 }).success).toBe(true)
  })

  it('rejects a non-positive pageNumber', () => {
    expect(UpdatePageBodySchema.safeParse({ pageNumber: 0 }).success).toBe(false)
  })
})

describe('PageService.updatePage extended fields', () => {
  it('never writes originalFile even if it reaches the service layer', async () => {
    const { repo, manuscriptState } = makeDeps()
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await svc.updatePage('u1', 'p1', { originalFile: 'uploads/u1/redraw.png' } as never)

    expect(repo.updatePage).not.toHaveBeenCalled()
  })

  it('persists pageNumber when the slot is free', async () => {
    const { repo, manuscriptState } = makeDeps({
      findPageByChapterAndNumber: jest.fn().mockResolvedValue(null)
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await svc.updatePage('u1', 'p1', { pageNumber: 4 })

    expect(repo.findPageByChapterAndNumber).toHaveBeenCalledWith('c1', 4)
    expect(repo.updatePage).toHaveBeenCalledWith('p1', { pageNumber: 4 })
  })

  it('rejects a pageNumber already taken by another page in the same chapter', async () => {
    const { repo, manuscriptState } = makeDeps({
      findPageByChapterAndNumber: jest.fn().mockResolvedValue({ id: 'p-other', chapterId: 'c1', pageNumber: 4 })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await expect(svc.updatePage('u1', 'p1', { pageNumber: 4 })).rejects.toBe(DuplicatePageNumberException)
    expect(repo.updatePage).not.toHaveBeenCalled()
  })

  it('allows re-sending the page its own current number', async () => {
    const { repo, manuscriptState } = makeDeps({
      findPageByChapterAndNumber: jest.fn().mockResolvedValue({ id: 'p1', chapterId: 'c1', pageNumber: 4 })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await expect(svc.updatePage('u1', 'p1', { pageNumber: 4 })).resolves.toBeDefined()
  })

  it('writes both fields in a single update call', async () => {
    const { repo, manuscriptState } = makeDeps({
      findPageByChapterAndNumber: jest.fn().mockResolvedValue(null)
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )

    await svc.updatePage('u1', 'p1', { compositeFile: 'k2', pageNumber: 7 })

    expect(repo.updatePage).toHaveBeenCalledTimes(1)
    expect(repo.updatePage).toHaveBeenCalledWith('p1', {
      compositeFile: 'k2',
      pageNumber: 7
    })
  })
})

describe('PageService.createPage gate (Name APPROVED)', () => {
  const CH = '012345678901234567890123'

  it('chapter has no Name → 409 ChapterNameNotApproved', async () => {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: null }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' })
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.createPage('u1', CH, { pageNumber: 1, originalFile: 'f.png' })).rejects.toThrow()
  })

  it('Name not APPROVED → 409', async () => {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
      findNameStatus: jest.fn().mockResolvedValue(NameStatus.IN_REVIEW)
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await expect(svc.createPage('u1', CH, { pageNumber: 1, originalFile: 'f.png' })).rejects.toThrow()
  })

  it('Name APPROVED → creates page + Manuscript IN_PRODUCTION', async () => {
    const { repo, manuscriptState } = makeDeps({
      findChapterById: jest.fn().mockResolvedValue({ id: CH, seriesId: 's1', nameId: 'n1' }),
      findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'u1' }),
      findManuscriptByChapterId: jest.fn().mockResolvedValue({ id: 'm1', status: ManuscriptStatus.DRAFT }),
      findNameStatus: jest.fn().mockResolvedValue(NameStatus.APPROVED)
    })
    const svc = new PageService(
      repo as never,
      manuscriptState as never,
      makeStudio() as never,
      makeNotification() as never,
      makeAudit() as never,
      makeStorage() as never
    )
    await svc.createPage('u1', CH, { pageNumber: 1, originalFile: 'uploads/u1/p1.png' })
    expect(repo.createPage).toHaveBeenCalledWith(CH, { pageNumber: 1, originalFile: 'uploads/u1/p1.png' })
    expect(manuscriptState.transition).toHaveBeenCalledWith(CH, ManuscriptStatus.IN_PRODUCTION, { changedBy: 'u1' })
  })
})
