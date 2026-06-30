import { Injectable } from '@nestjs/common'
import { ChapterNotFoundException, NotSeriesEditorException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { ExtendDeadlineBodyType, SetScheduleBodyType } from '../schemas/chapter-schemas'

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

  async getDeadlineContext(chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) return null
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) return null
    const schedule = await this.chapterRepository.findScheduleByChapterId(chapterId)
    return { chapter, series, schedule }
  }
}
