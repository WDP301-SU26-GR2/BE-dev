import { PublicationType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type CreateReaderVoteData = {
  surveyPeriodId: string
  seriesIds: string[]
  identityHash: string
  publicationType: PublicationType | null
  authMethod?: 'EMAIL_OTP' | 'PHONE_OTP' | 'CAPTCHA_ONLY' | null
  ipHash?: string
  captchaScore?: number | null
  voteWeight: number
  isFlagged: boolean
}

export class SurveyVoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateReaderVoteData) {
    return this.prisma.readerVote.create({
      data: {
        surveyPeriodId: data.surveyPeriodId,
        seriesIds: data.seriesIds,
        identityHash: data.identityHash,
        publicationType: data.publicationType,
        authMethod: data.authMethod ?? null,
        ipHash: data.ipHash ?? null,
        captchaScore: data.captchaScore ?? null,
        voteWeight: data.voteWeight,
        isFlagged: data.isFlagged
      }
    })
  }

  findByPeriodAndIdentity(surveyPeriodId: string, identityHash: string, publicationType: PublicationType | null) {
    return this.prisma.readerVote.findFirst({ where: { surveyPeriodId, identityHash, publicationType } })
  }

  countByPeriodAndIp(surveyPeriodId: string, ipHash: string, publicationType: PublicationType | null): Promise<number> {
    return this.prisma.readerVote.count({ where: { surveyPeriodId, ipHash, publicationType } })
  }

  getByPeriod(surveyPeriodId: string) {
    return this.prisma.readerVote.findMany({ where: { surveyPeriodId } })
  }

  findManySerializedSeriesPublic(publicationType?: PublicationType) {
    return this.prisma.series.findMany({
      where: { status: 'SERIALIZED', publicationType: publicationType ?? { not: null } },
      select: { id: true, title: true, coverImage: true, genres: true, demographic: true, publicationType: true },
      orderBy: { title: 'asc' }
    })
  }

  findSeriesTitlesByIds(seriesIds: string[]) {
    if (seriesIds.length === 0) return Promise.resolve([])
    return this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, title: true, publicationType: true }
    })
  }

  findPublicSeriesByIds(seriesIds: string[]) {
    if (seriesIds.length === 0) return Promise.resolve([])
    return this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, title: true, coverImage: true, genres: true, demographic: true, publicationType: true },
      orderBy: { title: 'asc' }
    })
  }

  async countPublishedChaptersBySeriesIds(seriesIds: string[]): Promise<Map<string, number>> {
    if (seriesIds.length === 0) return new Map()
    const grouped = await this.prisma.chapter.groupBy({
      by: ['seriesId'],
      where: { seriesId: { in: seriesIds }, status: 'PUBLISHED' },
      _count: { _all: true }
    })
    return new Map(grouped.map((group) => [group.seriesId, group._count._all]))
  }

  async findHeldChapterSeriesIds(seriesIds: string[], thresholdDate: Date): Promise<Set<string>> {
    if (seriesIds.length === 0) return new Set()
    const chapters = await this.prisma.chapter.findMany({
      where: { seriesId: { in: seriesIds } },
      select: { seriesId: true, hold: true }
    })
    const result = new Set<string>()
    for (const chapter of chapters) {
      if (chapter.hold?.heldAt && chapter.hold.heldAt < thresholdDate) result.add(chapter.seriesId)
    }
    return result
  }

  findSeriesOwnershipByIds(seriesIds: string[]) {
    return this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, status: true, mangakaId: true, editorId: true, magazine: true, publicationType: true }
    })
  }

  async findBoardMemberIds(): Promise<string[]> {
    const role = await this.prisma.role.findFirst({ where: { code: 'BOARD_MEMBER' }, select: { id: true } })
    if (!role) return []
    const users = await this.prisma.user.findMany({
      where: { roleId: role.id, deletedAt: { isSet: false } },
      select: { id: true }
    })
    return users.map((user) => user.id)
  }
}
