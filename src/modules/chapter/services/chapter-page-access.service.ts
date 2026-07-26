import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { ChapterRepository } from '../chapter.repo'
import {
  ChapterAccessDeniedException,
  ChapterNotFoundException,
  ChapterOnHoldException,
  NotSeriesOwnerException
} from '../errors/chapter.errors'

@Injectable()
export class ChapterPageAccessService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly studioAssignmentService: StudioAssignmentService
  ) {}

  async requireOwner(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.mangakaId !== userId) throw NotSeriesOwnerException
    if (chapter.hold) throw ChapterOnHoldException
    return chapter
  }

  async assertReadAccess(userId: string, roleName: string, chapterId: string) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    if (roleName === RoleName.MANGAKA && series.mangakaId !== userId) throw ChapterAccessDeniedException
    if (roleName === RoleName.EDITOR && series.editorId !== userId) throw ChapterAccessDeniedException
    if (roleName === RoleName.ASSISTANT) {
      const active = await this.studioAssignmentService.findActiveForPair(series.mangakaId, userId)
      if (!active) throw ChapterAccessDeniedException
    }
  }
}
