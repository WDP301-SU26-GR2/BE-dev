import { Injectable } from '@nestjs/common'
import { ProposalStatus, SeriesStatus } from '@prisma/client'
import { SeriesMessages } from '../series.messages'
import { SeriesRequestRequiredException } from '../errors/series.errors'
import { SeriesRepository } from '../series.repo'
import { toSeriesRes } from '../series.mapper'
import { SeriesStateService } from './series-state.service'
import { SeriesProposalAccessService } from './series-proposal-access.service'

// Spec 30: tách withdraw ra service riêng — giữ file chính <200 dòng theo boundary rule.
// Guard mới:
//  - DRAFT → chưa nộp nên không có gì để rút (FE dùng DELETE proposal).
//  - READY_TO_PITCH → phải qua yêu cầu chính thức (POST /series-requests) vì biên tập viên
//    đã bỏ công chuẩn bị hồ sơ trình Hội đồng.
@Injectable()
export class SeriesWithdrawService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService,
    private readonly accessService: SeriesProposalAccessService
  ) {}

  async withdraw(mangakaId: string, seriesId: string, reason: string) {
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    if (series.status === SeriesStatus.DRAFT || series.status === SeriesStatus.READY_TO_PITCH) {
      throw SeriesRequestRequiredException
    }
    // Transition TRƯỚC (validate state machine — PITCHED trở đi bị 409), proposal status ghi SAU.
    await this.seriesStateService.transition(seriesId, SeriesStatus.WITHDRAWN, {
      changedBy: mangakaId,
      reason
    })
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.WITHDRAWN)
    if (series.status === SeriesStatus.REJECTED && series.editorId) {
      await this.accessService.notify(
        series.editorId,
        seriesId,
        'SERIES_WITHDRAWN_AFTER_REJECT',
        SeriesMessages.notification.seriesWithdrawnAfterReject
      )
    }
    if (series.status === SeriesStatus.IN_REVIEW && series.editorId) {
      await this.accessService.notify(
        series.editorId,
        seriesId,
        'SERIES_WITHDRAWN_IN_REVIEW',
        SeriesMessages.notification.seriesWithdrawnInReview
      )
    }
    return toSeriesRes(updated)
  }
}
