import { RoleName } from 'src/core/security/constants/role.constant'
import { TransferAccessPolicy } from './transfer-access.policy'

const policy = new TransferAccessPolicy()

const request = {
  requestingMangakaId: 'mangaka-b',
  originalMangakaId: 'mangaka-a',
  editorId: 'editor-assigned'
}

describe('TransferAccessPolicy', () => {
  it.each([
    ['requesting Mangaka', { userId: 'mangaka-b', roleName: RoleName.MANGAKA }, true],
    ['original Mangaka', { userId: 'mangaka-a', roleName: RoleName.MANGAKA }, true],
    ['assigned Editor', { userId: 'editor-assigned', roleName: RoleName.EDITOR }, true],
    ['other Editor', { userId: 'editor-other', roleName: RoleName.EDITOR }, false],
    ['Board member', { userId: 'board-any', roleName: RoleName.BOARD_MEMBER }, true],
    ['Super Admin', { userId: 'admin', roleName: RoleName.SUPER_ADMIN }, true],
    ['unrelated Mangaka', { userId: 'mangaka-c', roleName: RoleName.MANGAKA }, false]
  ])('canViewRequest: %s', (_label, actor, expected) => {
    expect(policy.canViewRequest(actor, request)).toBe(expected)
  })

  it.each([
    ['assigned Editor', { userId: 'editor-assigned', roleName: RoleName.EDITOR }, true],
    ['other Editor', { userId: 'editor-other', roleName: RoleName.EDITOR }, false],
    ['Board member', { userId: 'board', roleName: RoleName.BOARD_MEMBER }, false]
  ])('canManageNegotiation: %s', (_label, actor, expected) => {
    expect(policy.canManageNegotiation(actor, request)).toBe(expected)
  })

  it('only allows the original Mangaka to review the negotiation', () => {
    expect(policy.canOriginalMangakaReview({ userId: 'mangaka-a', roleName: RoleName.MANGAKA }, request)).toBe(true)
    expect(policy.canOriginalMangakaReview({ userId: 'mangaka-b', roleName: RoleName.MANGAKA }, request)).toBe(false)
  })

  it('only allows a Board actor in the authoritative roster to decide', () => {
    expect(policy.canBoardDecide({ userId: 'board-1', roleName: RoleName.BOARD_MEMBER }, ['board-1', 'board-2'])).toBe(
      true
    )
    expect(
      policy.canBoardDecide({ userId: 'board-other', roleName: RoleName.BOARD_MEMBER }, ['board-1', 'board-2'])
    ).toBe(false)
    expect(policy.canBoardDecide({ userId: 'board-1', roleName: RoleName.EDITOR }, ['board-1'])).toBe(false)
  })

  it.each([
    ['Mangaka A', { userId: 'mangaka-a', roleName: RoleName.MANGAKA }, 'MANGAKA_A'],
    ['Mangaka B', { userId: 'mangaka-b', roleName: RoleName.MANGAKA }, 'MANGAKA_B'],
    ['rostered Board', { userId: 'board-1', roleName: RoleName.BOARD_MEMBER }, 'BOARD'],
    ['unrelated Mangaka', { userId: 'mangaka-c', roleName: RoleName.MANGAKA }, null],
    ['unrostered Board', { userId: 'board-other', roleName: RoleName.BOARD_MEMBER }, null]
  ])('deriveSignerRole: %s', (_label, actor, expected) => {
    expect(
      policy.deriveSignerRole(actor, {
        fromMangakaId: 'mangaka-a',
        toMangakaId: 'mangaka-b',
        boardMemberIds: ['board-1']
      })
    ).toBe(expected)
  })

  it.each([
    ['Super Admin', { userId: 'admin', roleName: RoleName.SUPER_ADMIN }, true],
    ['assigned Editor', { userId: 'editor-assigned', roleName: RoleName.EDITOR }, true],
    ['other Editor', { userId: 'editor-other', roleName: RoleName.EDITOR }, false],
    ['rostered Board', { userId: 'board-1', roleName: RoleName.BOARD_MEMBER }, true],
    ['unrostered Board', { userId: 'board-other', roleName: RoleName.BOARD_MEMBER }, false],
    ['Mangaka A', { userId: 'mangaka-a', roleName: RoleName.MANGAKA }, true],
    ['Mangaka B', { userId: 'mangaka-b', roleName: RoleName.MANGAKA }, true],
    ['unrelated Mangaka', { userId: 'mangaka-c', roleName: RoleName.MANGAKA }, false]
  ])('canViewContract: %s', (_label, actor, expected) => {
    expect(
      policy.canViewContract(actor, {
        fromMangakaId: 'mangaka-a',
        toMangakaId: 'mangaka-b',
        editorId: 'editor-assigned',
        boardMemberIds: ['board-1']
      })
    ).toBe(expected)
  })
})
