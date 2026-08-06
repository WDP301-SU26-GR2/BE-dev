import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { MagazineUsagePort } from 'src/modules/app-config/ports/magazine-usage.port'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class MagazineUsageSurveyAdapter extends MagazineUsagePort {
  constructor(private readonly prisma: PrismaService) {
    super()
  }
  countByMagazine(magazine: string): Promise<number> {
    return this.prisma.surveyPeriod.count({ where: { magazine } })
  }
  countByMagazineAndType(magazine: string, publicationType: string): Promise<number> {
    return this.prisma.surveyPeriod.count({
      where: { magazine, publicationType: publicationType as PublicationType }
    })
  }
}
