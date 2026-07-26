import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActorContext, TransferSignerRole } from '../transfer.types'

type TransferRequestAccessResource = {
  requestingMangakaId: string
  originalMangakaId: string
  editorId: string | null
}

type TransferContractAccessResource = {
  fromMangakaId: string | null
  toMangakaId: string | null
  editorId: string | null
  boardMemberIds: string[]
}

@Injectable()
export class TransferAccessPolicy {
  canViewRequest(actor: ActorContext, resource: TransferRequestAccessResource): boolean {
    if (actor.roleName === RoleName.SUPER_ADMIN || actor.roleName === RoleName.BOARD_MEMBER) return true
    if (actor.roleName === RoleName.EDITOR) return resource.editorId === actor.userId
    return (
      actor.roleName === RoleName.MANGAKA &&
      (resource.requestingMangakaId === actor.userId || resource.originalMangakaId === actor.userId)
    )
  }

  canManageNegotiation(actor: ActorContext, resource: TransferRequestAccessResource): boolean {
    return actor.roleName === RoleName.EDITOR && resource.editorId === actor.userId
  }

  canOriginalMangakaReview(actor: ActorContext, resource: TransferRequestAccessResource): boolean {
    return actor.roleName === RoleName.MANGAKA && resource.originalMangakaId === actor.userId
  }

  canBoardDecide(actor: ActorContext, boardMemberIds: string[]): boolean {
    return actor.roleName === RoleName.BOARD_MEMBER && boardMemberIds.includes(actor.userId)
  }

  canViewContract(actor: ActorContext, resource: TransferContractAccessResource): boolean {
    if (actor.roleName === RoleName.SUPER_ADMIN) return true
    if (actor.roleName === RoleName.EDITOR) return resource.editorId === actor.userId
    if (actor.roleName === RoleName.BOARD_MEMBER) return resource.boardMemberIds.includes(actor.userId)
    return (
      actor.roleName === RoleName.MANGAKA &&
      (resource.fromMangakaId === actor.userId || resource.toMangakaId === actor.userId)
    )
  }

  deriveSignerRole(
    actor: ActorContext,
    resource: Pick<TransferContractAccessResource, 'fromMangakaId' | 'toMangakaId' | 'boardMemberIds'>
  ): TransferSignerRole | null {
    if (actor.roleName === RoleName.MANGAKA && resource.fromMangakaId === actor.userId) return 'MANGAKA_A'
    if (actor.roleName === RoleName.MANGAKA && resource.toMangakaId === actor.userId) return 'MANGAKA_B'
    if (actor.roleName === RoleName.BOARD_MEMBER && resource.boardMemberIds.includes(actor.userId)) return 'BOARD'
    return null
  }
}
