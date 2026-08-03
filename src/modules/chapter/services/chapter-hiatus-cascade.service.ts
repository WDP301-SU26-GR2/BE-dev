import { Injectable } from '@nestjs/common'
import { ChapterHoldAction, ChapterHoldSource, ChapterStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { ChapterMessages } from '../chapter.messages'

// Spec 30: HIATUS ở cấp bộ truyện phải đóng băng sản xuất ở cấp chương (Requiment §1.10).
// Chỉ đụng tới hold do chính hiatus tạo (source = SERIES_HIATUS) — hold thủ công của biên tập viên giữ nguyên.
@Injectable()
export class ChapterHiatusCascadeService {
  constructor(private readonly prisma: PrismaService) {}

  async holdAllForHiatus(seriesId: string, actorId: string, reason: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const chapters = await tx.chapter.findMany({
        where: { seriesId, status: { not: ChapterStatus.PUBLISHED } },
        select: { id: true, hold: true }
      })
      const targets = chapters.filter((chapter) => !chapter.hold)
      for (const chapter of targets) {
        await tx.chapter.update({
          where: { id: chapter.id },
          data: {
            hold: { set: { reason, heldBy: actorId, heldAt: new Date(), source: ChapterHoldSource.SERIES_HIATUS } },
            holdHistory: { push: { action: ChapterHoldAction.HOLD, by: actorId, reason, at: new Date() } }
          }
        })
      }
      return targets.map((chapter) => chapter.id)
    })
  }

  async releaseAllForResume(seriesId: string, actorId: string, pausedMs: number): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const chapters = await tx.chapter.findMany({
        where: { seriesId, status: { not: ChapterStatus.PUBLISHED } },
        select: { id: true, hold: true }
      })
      const targets = chapters.filter((chapter) => chapter.hold?.source === ChapterHoldSource.SERIES_HIATUS)
      for (const chapter of targets) {
        await tx.chapter.update({
          where: { id: chapter.id },
          data: {
            hold: { unset: true },
            holdHistory: {
              push: {
                action: ChapterHoldAction.RESUME,
                by: actorId,
                reason: ChapterMessages.reason.hiatusResumed,
                at: new Date()
              }
            }
          }
        })
        if (pausedMs <= 0) continue
        const schedule = await tx.schedule.findUnique({ where: { chapterId: chapter.id } })
        if (!schedule?.currentDeadline) continue
        const newDeadline = new Date(schedule.currentDeadline.getTime() + pausedMs)
        await tx.schedule.update({
          where: { chapterId: chapter.id },
          data: {
            currentDeadline: newDeadline,
            extended: true,
            extensions: {
              push: {
                extendedBy: actorId,
                previousDeadline: schedule.currentDeadline,
                newDeadline,
                reason: ChapterMessages.reason.hiatusDeadlineShift,
                extendedAt: new Date()
              }
            }
          }
        })
      }
      return targets.map((chapter) => chapter.id)
    })
  }
}
