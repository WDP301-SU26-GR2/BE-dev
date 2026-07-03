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
}
