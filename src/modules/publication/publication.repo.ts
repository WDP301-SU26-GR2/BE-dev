import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreatePublicationVersionType, UpdatePublicationVersionType } from './schemas/publication-schemas'

@Injectable()
export class PublicationRepo {
  constructor(private readonly prisma: PrismaService) {}

  findSeriesBasics(seriesId: string) {
    return this.prisma.series.findFirst({
      where: { id: seriesId },
      select: { id: true, mangakaId: true, editorId: true }
    })
  }

  create(seriesId: string, data: CreatePublicationVersionType) {
    return this.prisma.publicationVersion.create({
      data: {
        seriesId,
        language: data.language,
        readingDirection: data.readingDirection,
        versionType: data.versionType ?? null,
        notes: data.notes ?? null
      }
    })
  }

  findManyBySeries(seriesId: string) {
    return this.prisma.publicationVersion.findMany({ where: { seriesId }, orderBy: { createdAt: 'desc' } })
  }

  findById(id: string) {
    return this.prisma.publicationVersion.findUnique({ where: { id } })
  }

  update(id: string, data: UpdatePublicationVersionType) {
    const patch: Record<string, unknown> = {}
    if (data.language != null) patch.language = data.language
    if (data.readingDirection != null) patch.readingDirection = data.readingDirection
    if (data.versionType != null) patch.versionType = data.versionType
    if (data.notes != null) patch.notes = data.notes
    return this.prisma.publicationVersion.update({ where: { id }, data: patch })
  }

  delete(id: string) {
    return this.prisma.publicationVersion.delete({ where: { id } })
  }
}
