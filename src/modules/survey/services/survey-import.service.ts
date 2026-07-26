import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NotificationService } from 'src/modules/notification/notification.service'
import { ImportSurveyDataBodyDto } from '../dto/survey.dto'
import {
  SeriesNotVotableException,
  SurveyDataImportNotAllowedException,
  SurveyPeriodNotFoundException
} from '../errors/survey.errors'
import { SurveyMessages } from '../survey.messages'
import { SurveyRepository } from '../survey.repo'

@Injectable()
export class SurveyImportService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly notificationService: NotificationService
  ) {}

  async importSurveyData(body: ImportSurveyDataBodyDto, userId: string) {
    // Spec 11 §1.1: guard body.surveyPeriodId TRƯỚC khi đụng Prisma — id rác sẽ throw P2023 (500).
    if (!isObjectId(body.surveyPeriodId)) throw SurveyPeriodNotFoundException

    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(body.surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status !== 'CLOSED') throw SurveyDataImportNotAllowedException
    const isScopedPeriod =
      surveyPeriod.magazine != null &&
      surveyPeriod.publicationType != null &&
      surveyPeriod.issueNumber != null &&
      surveyPeriod.eligibleSeriesIds.length > 0
    if (isScopedPeriod) {
      const eligible = new Set(surveyPeriod.eligibleSeriesIds)
      if (body.entries.some((entry) => !eligible.has(entry.seriesId))) throw SeriesNotVotableException
    }
    await this.surveyRepository.createSurveyData({ ...body, importedBy: userId })
    await this.notificationService.notifySafe({
      recipientId: userId,
      type: NotificationType.SURVEY,
      referenceId: surveyPeriod.id,
      referenceType: 'SURVEY_DATA_IMPORTED',
      content: SurveyMessages.notification.surveyDataImported
    })
    return { message: SurveyMessages.response.surveyDataImported }
  }
}
