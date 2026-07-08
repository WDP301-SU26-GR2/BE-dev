import { Injectable } from '@nestjs/common'
import { ChapterNotFoundException, NotSeriesEditorException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { ExtendDeadlineBodyType, SetScheduleBodyType } from '../schemas/chapter-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ScheduleService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  private async requireEditor(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.editorId !== userId) throw NotSeriesEditorException
    return chapter
  }

  async setSchedule(userId: string, chapterId: string, body: SetScheduleBodyType) {
    await this.requireEditor(userId, chapterId)
    return this.chapterRepository.updateSchedule(chapterId, {
      originalDeadline: body.originalDeadline ? new Date(body.originalDeadline) : undefined,
      currentDeadline: body.currentDeadline ? new Date(body.currentDeadline) : undefined
    })
  }

  async extendDeadline(userId: string, chapterId: string, body: ExtendDeadlineBodyType) {
    await this.requireEditor(userId, chapterId)
    const schedule = await this.chapterRepository.findScheduleByChapterId(chapterId)
    return this.chapterRepository.extendSchedule(chapterId, {
      extendedBy: userId,
      previousDeadline: schedule?.currentDeadline ?? null,
      newDeadline: new Date(body.newDeadline),
      reason: body.reason
    })
  }

  // Spec 7 / A-DL-03: Board chốt deadline → ghi ScheduleExtension. Khác `extendDeadline` ở chỗ KHÔNG yêu cầu
  // editor assignment (Board member duyệt thay). Vẫn dùng cùng `extendSchedule` repo để giữ side-effect (currentDeadline,
  // extended=true, push extension) nhất quán với Editor unilateral flow (A-CHP-02).
  async extendDeadlineByBoard(userId: string, chapterId: string, newDeadline: Date, reason?: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const schedule = await this.chapterRepository.findScheduleByChapterId(chapterId)
    return this.chapterRepository.extendSchedule(chapterId, {
      extendedBy: userId,
      previousDeadline: schedule?.currentDeadline ?? null,
      newDeadline,
      reason
    })
  }

  async getDeadlineContext(chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) return null
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) return null
    const schedule = await this.chapterRepository.findScheduleByChapterId(chapterId)
    return { chapter, series, schedule }
  }
}
