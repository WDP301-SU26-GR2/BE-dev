import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class TankobonRepo {
  constructor(private readonly prisma: PrismaService) {}

  findSeriesById(seriesId: string) {
    return this.prisma.series.findUnique({ where: { id: seriesId } })
  }

  createSales(data: { seriesId: string; volumeNumber: number; unitsSold: number; period: string; recordedBy: string }) {
    return this.prisma.tankobonSales.create({ data })
  }

  findSalesBySeries(seriesId: string) {
    return this.prisma.tankobonSales.findMany({ where: { seriesId }, orderBy: { volumeNumber: 'asc' } })
  }

  findRankingTrend(seriesId: string, take: number) {
    return this.prisma.rankingRecord.findMany({
      where: { seriesId },
      orderBy: { recordedAt: 'desc' },
      take
    })
  }

  findSeriesReports(seriesId: string) {
    return this.prisma.seriesReport.findMany({ where: { seriesId }, orderBy: { createdAt: 'desc' } })
  }

  countPublishedChapters(seriesId: string) {
    return this.prisma.chapter.count({ where: { seriesId, status: 'PUBLISHED' } })
  }
}
