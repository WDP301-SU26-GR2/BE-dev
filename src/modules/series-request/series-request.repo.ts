import { Injectable } from '@nestjs/common'
import { Prisma, SeriesRequest, SeriesRequestStatus, SeriesRequestType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SERIES_REQUEST_CLOSED_STATES } from './series-request.constant'

export interface CreateSeriesRequestData {
  seriesId: string
  requestedBy: string
  requestType: SeriesRequestType
  reason: string
  expectedReturnDate: Date | null
  proposedEndingChapters: number | null
}

export interface ListSeriesRequestFilter {
  seriesId?: string
  status?: SeriesRequestStatus
  requestType?: SeriesRequestType
  seriesIdIn?: string[]
}

@Injectable()
export class SeriesRequestRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findById(id: string): Promise<SeriesRequest | null> {
    return this.prismaService.seriesRequest.findUnique({ where: { id } })
  }

  findOpenBySeries(seriesId: string): Promise<SeriesRequest | null> {
    return this.prismaService.seriesRequest.findFirst({
      where: { seriesId, status: { notIn: SERIES_REQUEST_CLOSED_STATES } }
    })
  }

  create(data: CreateSeriesRequestData): Promise<SeriesRequest> {
    return this.prismaService.seriesRequest.create({
      data: {
        seriesId: data.seriesId,
        requestedBy: data.requestedBy,
        requestType: data.requestType,
        reason: data.reason,
        expectedReturnDate: data.expectedReturnDate,
        proposedEndingChapters: data.proposedEndingChapters,
        status: SeriesRequestStatus.PENDING,
        statusHistory: {
          set: [{ from: null, to: SeriesRequestStatus.PENDING, by: data.requestedBy, reason: data.reason }]
        }
      }
    })
  }

  applyTransition(
    id: string,
    args: {
      from: SeriesRequestStatus
      to: SeriesRequestStatus
      by: string
      reason?: string | null
      extra?: Prisma.SeriesRequestUpdateInput
    }
  ): Promise<SeriesRequest> {
    return this.prismaService.seriesRequest.update({
      where: { id },
      data: {
        ...(args.extra ?? {}),
        status: args.to,
        statusHistory: {
          push: { from: args.from, to: args.to, by: args.by, reason: args.reason ?? null }
        }
      }
    })
  }

  private buildWhere(filter: ListSeriesRequestFilter): Prisma.SeriesRequestWhereInput {
    return {
      ...(filter.seriesId ? { seriesId: filter.seriesId } : {}),
      ...(filter.seriesIdIn ? { seriesId: { in: filter.seriesIdIn } } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.requestType ? { requestType: filter.requestType } : {})
    }
  }

  list(filter: ListSeriesRequestFilter, page: { limit: number; offset: number }): Promise<SeriesRequest[]> {
    return this.prismaService.seriesRequest.findMany({
      where: this.buildWhere(filter),
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset
    })
  }

  count(filter: ListSeriesRequestFilter): Promise<number> {
    return this.prismaService.seriesRequest.count({ where: this.buildWhere(filter) })
  }
}
