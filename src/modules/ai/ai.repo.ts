import { Injectable } from '@nestjs/common'
import { AiJob, AiJobStatus, AiJobType, AiSegmentMode, Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class AiRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createJob(data: {
    type: AiJobType
    mode: AiSegmentMode | null
    pageId: string
    requestedBy: string
  }): Promise<AiJob> {
    return await this.prismaService.aiJob.create({ data })
  }

  async findJobById(id: string): Promise<AiJob | null> {
    return await this.prismaService.aiJob.findUnique({ where: { id } })
  }

  async findOpenSegmentJob(pageId: string): Promise<AiJob | null> {
    return await this.prismaService.aiJob.findFirst({
      where: { pageId, type: 'SEGMENT', status: { in: ['QUEUED', 'RUNNING'] } }
    })
  }

  async listJobsByPage(pageId: string, type: AiJobType): Promise<AiJob[]> {
    return await this.prismaService.aiJob.findMany({ where: { pageId, type }, orderBy: { createdAt: 'desc' } })
  }

  async transitionStatus(
    id: string,
    from: AiJobStatus[],
    to: AiJobStatus,
    extra: Prisma.AiJobUpdateManyMutationInput = {}
  ): Promise<number> {
    const result = await this.prismaService.aiJob.updateMany({
      where: { id, status: { in: from } },
      data: { ...extra, status: to }
    })
    return result.count
  }

  async markApplied(id: string): Promise<AiJob> {
    return await this.prismaService.aiJob.update({ where: { id }, data: { appliedAt: new Date() } })
  }

  async findPageFile(pageId: string): Promise<{ id: string; originalFile: string | null } | null> {
    return await this.prismaService.page.findUnique({ where: { id: pageId }, select: { id: true, originalFile: true } })
  }
}
