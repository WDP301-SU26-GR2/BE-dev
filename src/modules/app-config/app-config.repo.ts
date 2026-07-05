import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class AppConfigRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findFirst() {
    return this.prismaService.appConfig.findFirst()
  }

  createDefaults(data: { nameMaxReviewRounds: number }) {
    return this.prismaService.appConfig.create({ data })
  }

  update(id: string, data: Prisma.AppConfigUpdateInput) {
    return this.prismaService.appConfig.update({ where: { id }, data })
  }
}
