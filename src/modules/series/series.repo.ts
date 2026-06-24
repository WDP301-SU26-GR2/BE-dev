import { Injectable } from '@nestjs/common'
import { NameStatus, ProposalStatus, SeriesStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesNotFoundException } from './errors/series.errors'
import { CreateProposalBodyType, UpdateProposalBodyType } from './schemas/series-schemas'

@Injectable()
export class SeriesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createProposalSeries(mangakaId: string, body: CreateProposalBodyType) {
    const series = await this.prismaService.series.create({
      data: {
        mangakaId,
        title: body.title,
        genre: body.genre ?? null,
        demographic: body.demographic ?? null,
        publicationType: body.publicationType ?? null,
        parentSeriesId: body.parentSeriesId ?? null,
        relationshipType: body.relationshipType ?? null,
        status: SeriesStatus.DRAFT,
        proposal: {
          synopsis: body.synopsis ?? null,
          characterDesigns: body.characterDesigns,
          targetDemographic: body.targetDemographic ?? null,
          estimatedLength: body.estimatedLength ?? null,
          status: ProposalStatus.DRAFT
        }
      }
    })

    const name = await this.prismaService.name.create({
      data: {
        seriesId: series.id,
        chapterNumber: null,
        status: NameStatus.DRAFT,
        version: 1,
        pages: body.namePages.map((p) => ({ pageNumber: p.pageNumber, fileUrl: p.fileUrl }))
      }
    })

    // `proposal` là composite OPTIONAL → Prisma chỉ hỗ trợ set/upsert/unset (KHÔNG có partial `update`).
    // Phải `set` cả object cũ + nameId, nếu không sẽ ghi đè rỗng synopsis/characterDesigns/... (data loss).
    const updated = await this.prismaService.series.update({
      where: { id: series.id },
      data: { proposal: { set: { ...series.proposal, nameId: name.id } } }
    })

    return { series: updated, name }
  }

  async findById(seriesId: string) {
    return await this.prismaService.series.findUnique({ where: { id: seriesId } })
  }

  async findNameById(nameId: string) {
    return await this.prismaService.name.findUnique({ where: { id: nameId } })
  }

  async updateProposalDraft(seriesId: string, nameId: string | null, body: UpdateProposalBodyType) {
    const series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series?.proposal) throw SeriesNotFoundException

    // Merge: field không gửi (undefined) giữ nguyên giá trị cũ. Dùng `set` full để tránh wipe composite.
    const updated = await this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        title: body.title,
        genre: body.genre,
        demographic: body.demographic,
        publicationType: body.publicationType,
        proposal: {
          set: {
            ...series.proposal,
            synopsis: body.synopsis ?? series.proposal.synopsis,
            characterDesigns: body.characterDesigns ?? series.proposal.characterDesigns,
            targetDemographic: body.targetDemographic ?? series.proposal.targetDemographic,
            estimatedLength: body.estimatedLength ?? series.proposal.estimatedLength
          }
        }
      }
    })

    if (body.namePages && nameId) {
      await this.updateNamePages(nameId, body.namePages)
    }

    return updated
  }

  async updateProposalStatus(seriesId: string, status: ProposalStatus) {
    const series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series?.proposal) throw SeriesNotFoundException
    // `set` full (composite optional không partial-update được) — giữ nguyên nameId/synopsis/...
    return await this.prismaService.series.update({
      where: { id: seriesId },
      data: { proposal: { set: { ...series.proposal, status } } }
    })
  }

  async setEditor(seriesId: string, editorId: string) {
    await this.prismaService.series.update({ where: { id: seriesId }, data: { editorId } })
  }

  async updateNameStatus(nameId: string, data: { status: NameStatus; version?: number; submittedAt?: Date }) {
    return await this.prismaService.name.update({ where: { id: nameId }, data })
  }

  async updateNamePages(nameId: string, pages: { pageNumber: number; fileUrl: string }[]) {
    return await this.prismaService.name.update({ where: { id: nameId }, data: { pages: { set: pages } } })
  }

  // Single-writer cho Series.status: chỉ method này (gọi từ SeriesStateService) ghi status + audit.
  // KHÔNG đụng `proposal` (composite) nên không bị wipe; chỉ set scalar `status`/`statusReason` + push history.
  async updateStatusWithHistory(
    seriesId: string,
    entry: { fromStatus: SeriesStatus; toStatus: SeriesStatus; changedBy: string; reason?: string }
  ) {
    return await this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        status: entry.toStatus,
        statusReason: entry.reason,
        statusHistory: {
          push: {
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
            changedBy: entry.changedBy,
            reason: entry.reason ?? null,
            at: new Date()
          }
        }
      }
    })
  }
}
