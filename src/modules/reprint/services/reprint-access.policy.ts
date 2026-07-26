import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'

export type ActorContext = { userId: string; roleName: string }
export type ReprintAccessChapter = {
  originalChapterId: string | null
  reviserId?: string | null
  reviserType?: string | null
}
export type ReprintAccessSubject = {
  editorId?: string | null
  ownerMangakaIds: string[]
  chapters: ReprintAccessChapter[]
}

@Injectable()
export class ReprintAccessPolicy {
  canReadRequest(actor: ActorContext, subject: ReprintAccessSubject) {
    return (
      this.hasSystemRead(actor) ||
      this.isAssignedEditor(actor, subject) ||
      this.isOwnerMangaka(actor, subject) ||
      subject.chapters.some((chapter) => chapter.reviserId === actor.userId)
    )
  }

  canReadChapter(actor: ActorContext, subject: ReprintAccessSubject, chapterId: string) {
    if (this.hasFullRead(actor, subject)) return true
    return subject.chapters.some(
      (chapter) => chapter.originalChapterId === chapterId && chapter.reviserId === actor.userId
    )
  }

  filterReadableChapters<T extends ReprintAccessChapter>(
    actor: ActorContext,
    subject: {
      editorId?: string | null
      ownerMangakaIds: string[]
      chapters: T[]
    }
  ): T[] {
    const chapters: T[] = subject.chapters
    if (this.hasFullRead(actor, subject)) return chapters
    return chapters.filter((chapter) => chapter.reviserId === actor.userId)
  }

  canCreateOrApprove(actor: ActorContext, subject: ReprintAccessSubject) {
    return actor.roleName === RoleName.EDITOR && this.isAssignedEditor(actor, subject)
  }

  canAssignReviser(actor: ActorContext, subject: ReprintAccessSubject) {
    return this.hasSystemRead(actor) || this.isAssignedEditor(actor, subject)
  }

  canUpdateManuscript(actor: ActorContext, subject: ReprintAccessSubject, chapterId: string) {
    if (this.isOwnerMangaka(actor, subject)) return true
    return (
      actor.roleName === RoleName.MANGAKA &&
      subject.chapters.some(
        (chapter) =>
          chapter.originalChapterId === chapterId &&
          chapter.reviserType === 'OTHER_MANGAKA' &&
          chapter.reviserId === actor.userId
      )
    )
  }

  private hasFullRead(actor: ActorContext, subject: ReprintAccessSubject) {
    return this.hasSystemRead(actor) || this.isAssignedEditor(actor, subject) || this.isOwnerMangaka(actor, subject)
  }
  private hasSystemRead(actor: ActorContext) {
    return actor.roleName === RoleName.BOARD_MEMBER || actor.roleName === RoleName.SUPER_ADMIN
  }
  private isAssignedEditor(actor: ActorContext, subject: ReprintAccessSubject) {
    return actor.roleName === RoleName.EDITOR && subject.editorId === actor.userId
  }
  private isOwnerMangaka(actor: ActorContext, subject: ReprintAccessSubject) {
    return actor.roleName === RoleName.MANGAKA && subject.ownerMangakaIds.includes(actor.userId)
  }
}
