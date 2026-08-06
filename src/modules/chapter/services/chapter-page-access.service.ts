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
    // chapter.seriesId đến từ DB → đã là ObjectId hợp lệ, không cần guard isObjectId lại.
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    await this.assertSeriesAccess(series, userId, roleName)
  }

  // Series-level đọc dùng cho GET /chapters?seriesId= (seriesId do client cung cấp → guard isObjectId).
  // Cùng luật scoping: chủ sở hữu / editor phụ trách / trợ lý đang cộng tác; Hội đồng + Super Admin toàn quyền đọc.
  async assertSeriesReadAccess(userId: string, roleName: string, seriesId: string) {
    if (!isObjectId(seriesId)) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(seriesId)
    if (!series) throw ChapterNotFoundException
    await this.assertSeriesAccess(series, userId, roleName)
  }

  private async assertSeriesAccess(
    series: { mangakaId: string; editorId: string | null },
    userId: string,
    roleName: string
  ) {
    if (roleName === RoleName.MANGAKA && series.mangakaId !== userId) throw ChapterAccessDeniedException
    if (roleName === RoleName.EDITOR && series.editorId !== userId) throw ChapterAccessDeniedException
    if (roleName === RoleName.ASSISTANT) {
      const active = await this.studioAssignmentService.findActiveForPair(series.mangakaId, userId)
      if (!active) throw ChapterAccessDeniedException
    }
  }
}
