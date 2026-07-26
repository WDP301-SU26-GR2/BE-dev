import { PublicationType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateSurveyPeriodBodyDto, ImportSurveyDataBodyDto } from '../dto/survey.dto'

export class SurveyPeriodRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSurveyPeriodBodyDto) {
    return this.prisma.surveyPeriod.create({
      data: {
        magazine: data.magazine.trim(),
        publicationType: data.publicationType,
        eligibleSeriesIds: data.eligibleSeriesIds,
        issueNumber: data.issueNumber,
        reflectedIssueNumber: data.reflectedIssueNumber ?? null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status ?? 'DRAFT'
      }
    })
  }

  findMany() {
    return this.prisma.surveyPeriod.findMany({ orderBy: { startDate: 'desc' } })
  }

  findById(id: string) {
    return this.prisma.surveyPeriod.findUnique({ where: { id } })
  }

  findScoped(magazine: string, publicationType: PublicationType, issueNumber: number) {
    return this.prisma.surveyPeriod.findFirst({ where: { magazine, publicationType, issueNumber } })
  }

  updateStatus(id: string, status: 'OPEN' | 'CLOSED' | 'REFLECTED') {
    return this.prisma.surveyPeriod.update({ where: { id }, data: { status } })
  }

  createSurveyData(data: ImportSurveyDataBodyDto & { importedBy: string }) {
    return this.prisma.surveyData.create({
      data: {
        surveyPeriodId: data.surveyPeriodId,
        importedBy: data.importedBy,
        surveyDate: data.surveyDate ? new Date(data.surveyDate) : null,
        entries: data.entries.map((entry) => ({ seriesId: entry.seriesId, voteCount: entry.voteCount }))
      }
    })
  }

  getSurveyData(surveyPeriodId: string) {
    return this.prisma.surveyData.findMany({ where: { surveyPeriodId } })
  }

  findLatestOpen() {
    return this.prisma.surveyPeriod.findFirst({
      where: { status: 'OPEN' },
      orderBy: { startDate: 'desc' }
    })
  }

  findLatestReflected() {
    return this.prisma.surveyPeriod.findFirst({
      where: { status: 'REFLECTED' },
      orderBy: [{ endDate: 'desc' }, { id: 'desc' }]
    })
  }

  findLatestReflectedScoped(magazine: string, publicationType: PublicationType) {
    return this.prisma.surveyPeriod.findFirst({
      where: { status: 'REFLECTED', magazine, publicationType },
      orderBy: [{ endDate: 'desc' }, { id: 'desc' }]
    })
  }

  findReflected(limit: number) {
    return this.findReflectedWhere({ status: 'REFLECTED' }, limit)
  }

  findReflectedScoped(magazine: string, publicationType: PublicationType, limit: number) {
    return this.findReflectedWhere({ status: 'REFLECTED', magazine, publicationType }, limit)
  }

  findPrevious(currentSurveyPeriodId: string) {
    return this.prisma.surveyPeriod.findFirst({
      where: { id: { not: currentSurveyPeriodId }, status: 'REFLECTED' },
      orderBy: { endDate: 'desc' }
    })
  }

  findPreviousScoped(currentSurveyPeriodId: string, magazine: string, publicationType: PublicationType) {
    return this.prisma.surveyPeriod.findFirst({
      where: { id: { not: currentSurveyPeriodId }, status: 'REFLECTED', magazine, publicationType },
      orderBy: [{ endDate: 'desc' }, { id: 'desc' }]
    })
  }

  findReflectedScopedInRange(magazine: string, publicationType: PublicationType, from: Date, to: Date) {
    return this.prisma.surveyPeriod.findMany({
      where: { status: 'REFLECTED', magazine, publicationType, startDate: { gte: from, lt: to } },
      select: { id: true }
    })
  }

  private findReflectedWhere(
    where: { status: 'REFLECTED'; magazine?: string; publicationType?: PublicationType },
    limit: number
  ) {
    return this.prisma.surveyPeriod.findMany({
      where,
      orderBy: [{ endDate: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        issueNumber: true,
        reflectedIssueNumber: true,
        startDate: true,
        endDate: true
      }
    })
  }
}
