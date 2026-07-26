import { RoleName } from 'src/core/security/constants/role.constant'
import { ReprintRequestController } from './reprint-request.controller'

const REQUEST_ID = '0123456789abcdef01234567'
const CHAPTER_ID = '1123456789abcdef01234567'

describe('ReprintRequestController actor propagation', () => {
  const makeController = () => {
    const facade = {
      findAll: jest.fn(),
      findById: jest.fn(),
      getChapters: jest.fn(),
      getChapterById: jest.fn(),
      updateChapterManuscript: jest.fn(),
      approveChapter: jest.fn(),
      create: jest.fn(),
      mangakaReview: jest.fn(),
      boardApprove: jest.fn(),
      assignReviser: jest.fn()
    }
    return { controller: new ReprintRequestController(facade as never), facade }
  }

  it('passes list filters and identity unchanged', async () => {
    const { controller, facade } = makeController()

    await controller.findAll('editor-1', RoleName.EDITOR, 'PENDING', 'series-1')

    expect(facade.findAll).toHaveBeenCalledWith('editor-1', RoleName.EDITOR, {
      status: 'PENDING',
      seriesId: 'series-1'
    })
  })

  it('propagates object-level actor context on every read route', async () => {
    const { controller, facade } = makeController()
    const actor = { userId: 'mangaka-1', roleName: RoleName.MANGAKA }

    await controller.findById(REQUEST_ID, actor.userId, actor.roleName)
    await controller.getChapters(REQUEST_ID, actor.userId, actor.roleName)
    await controller.getChapterById(REQUEST_ID, CHAPTER_ID, actor.userId, actor.roleName)

    expect(facade.findById).toHaveBeenCalledWith(REQUEST_ID, actor)
    expect(facade.getChapters).toHaveBeenCalledWith(REQUEST_ID, actor)
    expect(facade.getChapterById).toHaveBeenCalledWith(REQUEST_ID, CHAPTER_ID, actor)
  })

  it('propagates actor context and route identifiers on every mutation route', async () => {
    const { controller, facade } = makeController()
    const manuscript = { originalChapterId: CHAPTER_ID, manuscriptFile: 'manuscripts/chapter.pdf' }
    const approval = { originalChapterId: CHAPTER_ID, approve: true }
    const creation = {
      seriesId: '2123456789abcdef01234567',
      revisionMode: 'AS_IS',
      reason: 'Demand',
      chapterRangeStart: 1,
      chapterRangeEnd: 2
    } as const
    const assign = { reviserId: '3123456789abcdef01234567', reviserType: 'INTERNAL_TEAM' } as const

    await controller.updateChapterManuscript(REQUEST_ID, CHAPTER_ID, manuscript, 'm1', RoleName.MANGAKA)
    await controller.approveChapter(REQUEST_ID, CHAPTER_ID, approval, 'e1', RoleName.EDITOR)
    await controller.create('e1', RoleName.EDITOR, creation)
    await controller.mangakaReview(REQUEST_ID, { accept: true }, 'm1', RoleName.MANGAKA)
    await controller.boardApprove(REQUEST_ID, { approve: true }, 'b1', RoleName.BOARD_MEMBER)
    await controller.assignReviser(REQUEST_ID, CHAPTER_ID, assign, 'e1', RoleName.EDITOR)

    expect(facade.updateChapterManuscript).toHaveBeenCalledWith(REQUEST_ID, CHAPTER_ID, manuscript, {
      userId: 'm1',
      roleName: RoleName.MANGAKA
    })
    expect(facade.approveChapter).toHaveBeenCalledWith(REQUEST_ID, CHAPTER_ID, approval, {
      userId: 'e1',
      roleName: RoleName.EDITOR
    })
    expect(facade.create).toHaveBeenCalledWith({ userId: 'e1', roleName: RoleName.EDITOR }, creation)
    expect(facade.mangakaReview).toHaveBeenCalledWith(
      REQUEST_ID,
      { accept: true },
      { userId: 'm1', roleName: RoleName.MANGAKA }
    )
    expect(facade.boardApprove).toHaveBeenCalledWith(
      REQUEST_ID,
      { approve: true },
      { userId: 'b1', roleName: RoleName.BOARD_MEMBER }
    )
    expect(facade.assignReviser).toHaveBeenCalledWith(REQUEST_ID, CHAPTER_ID, assign, {
      userId: 'e1',
      roleName: RoleName.EDITOR
    })
  })
})
