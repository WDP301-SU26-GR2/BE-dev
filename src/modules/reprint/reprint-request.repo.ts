import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { $Enums } from '@prisma/client'

@Injectable()
export class ReprintRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.reprintRequest.create({
      data
    })
  }

  async update(id: string, data: any) {
    return this.prisma.reprintRequest.update({
      where: { id },
      data
    })
  }

  async findById(id: string) {
    return this.prisma.reprintRequest.findUnique({
      where: { id }
    })
  }

  // Spec 3 §4.4 + Spec 9 Part 4: MANGAKA chỉ thấy reprint của series mình (series.mangakaId===userId);
  // EDITOR chỉ thấy reprint của series mình phụ trách (series.editorId===userId).
  // Board/SuperAdmin → all.
  async findManyScoped(params: { userId: string; roleName: string; status?: string; seriesId?: string }) {
    const where: any = {}
    if (params.status) where.status = params.status
    if (params.seriesId) where.seriesId = params.seriesId
    // EDITOR scoping applies first — an editor who is also a co-owner on a series must still be
    // constrained to their owned set (defense-in-depth; mirrors series.findManyByViewer pattern).
    if (params.roleName === 'EDITOR') {
      const owned = await this.prisma.series.findMany({ where: { editorId: params.userId }, select: { id: true } })
      const ids = owned.map((s) => s.id)
      if (ids.length === 0) return []
      where.seriesId = params.seriesId && ids.includes(params.seriesId) ? params.seriesId : { in: ids }
    } else if (params.roleName === 'MANGAKA') {
      const owned = await this.prisma.series.findMany({ where: { mangakaId: params.userId }, select: { id: true } })
      const ids = owned.map((s) => s.id)
      if (ids.length === 0) return []
      where.seriesId = params.seriesId && ids.includes(params.seriesId) ? params.seriesId : { in: ids }
    }
    return this.prisma.reprintRequest.findMany({ where, orderBy: { createdAt: 'desc' } })
  }

  // Lấy hợp đồng mới nhất đang có hiệu lực thi hành đầy đủ (FULLY_EXECUTED) để xác định Ownership (B-RPT-02)
  async findActiveContractBySeriesId(seriesId: string) {
    return this.prisma.contract.findFirst({
      where: {
        seriesId,
        status: $Enums.ContractStatus.FULLY_EXECUTED
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  // Tìm danh sách các chương gốc thuộc khoảng tập yêu cầu tái bản (B-RPT-03)
  async findOriginalChaptersByRange(seriesId: string, start: number, end: number) {
    return this.prisma.chapter.findMany({
      where: {
        seriesId,
        chapterNumber: {
          gte: start,
          lte: end
        },
        status: 'PUBLISHED'
      },
      orderBy: {
        chapterNumber: 'asc'
      }
    })
  }

  // PB-07: Tra user + role để xác minh reviser khi reviserType=OTHER_MANGAKA phải là role MANGAKA
  async findUserRole(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
  }
}
