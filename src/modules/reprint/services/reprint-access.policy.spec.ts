import { RoleName } from 'src/core/security/constants/role.constant'
import { ReprintAccessPolicy, ReprintAccessSubject } from './reprint-access.policy'

const subject: ReprintAccessSubject = {
  editorId: 'editor-1',
  ownerMangakaIds: ['owner-1'],
  chapters: [
    { originalChapterId: 'chapter-a', reviserId: 'reviser-a', reviserType: 'OTHER_MANGAKA' },
    { originalChapterId: 'chapter-b', reviserId: 'reviser-b', reviserType: 'OTHER_MANGAKA' }
  ]
}

describe('ReprintAccessPolicy', () => {
  const policy = new ReprintAccessPolicy()

  it.each([
    ['board', { userId: 'board-1', roleName: RoleName.BOARD_MEMBER }, true],
    ['super admin', { userId: 'admin-1', roleName: RoleName.SUPER_ADMIN }, true],
    ['assigned editor', { userId: 'editor-1', roleName: RoleName.EDITOR }, true],
    ['other editor', { userId: 'editor-2', roleName: RoleName.EDITOR }, false],
    ['owner mangaka', { userId: 'owner-1', roleName: RoleName.MANGAKA }, true],
    ['other mangaka', { userId: 'other-1', roleName: RoleName.MANGAKA }, false],
    ['assigned reviser', { userId: 'reviser-a', roleName: RoleName.MANGAKA }, true]
  ])('%s request read = %s', (_label, actor, expected) => {
    expect(policy.canReadRequest(actor, subject)).toBe(expected)
  })

  it.each([
    ['assigned editor', { userId: 'editor-1', roleName: RoleName.EDITOR }, true],
    ['other editor', { userId: 'editor-2', roleName: RoleName.EDITOR }, false],
    ['owner mangaka', { userId: 'owner-1', roleName: RoleName.MANGAKA }, false],
    ['board', { userId: 'board-1', roleName: RoleName.BOARD_MEMBER }, false]
  ])('%s create/approve permission = %s', (_label, actor, expected) => {
    expect(policy.canCreateOrApprove(actor, subject)).toBe(expected)
  })

  it.each([
    ['board', { userId: 'board-1', roleName: RoleName.BOARD_MEMBER }, true],
    ['assigned editor', { userId: 'editor-1', roleName: RoleName.EDITOR }, true],
    ['other editor', { userId: 'editor-2', roleName: RoleName.EDITOR }, false]
  ])('%s assign-reviser permission = %s', (_label, actor, expected) => {
    expect(policy.canAssignReviser(actor, subject)).toBe(expected)
  })

  it.each([
    ['owner mangaka', { userId: 'owner-1', roleName: RoleName.MANGAKA }, 'chapter-b', true],
    ['assigned reviser', { userId: 'reviser-a', roleName: RoleName.MANGAKA }, 'chapter-a', true],
    ['reviser on another chapter', { userId: 'reviser-a', roleName: RoleName.MANGAKA }, 'chapter-b', false],
    ['other mangaka', { userId: 'other-1', roleName: RoleName.MANGAKA }, 'chapter-a', false]
  ])('%s manuscript update = %s', (_label, actor, chapterId, expected) => {
    expect(policy.canUpdateManuscript(actor, subject, chapterId)).toBe(expected)
  })

  it('filters a reviser collection to only their assigned chapter', () => {
    expect(policy.filterReadableChapters({ userId: 'reviser-a', roleName: RoleName.MANGAKA }, subject)).toEqual([
      subject.chapters[0]
    ])
  })
})
