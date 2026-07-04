import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ChapterService } from './chapter.service'
import { StudioOverviewResDto } from './dto/chapter.dto'

@ApiTags('studio')
@ApiBearerAuth()
@Controller('studio')
export class StudioOverviewController {
  constructor(private readonly chapterService: ChapterService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Mangaka overview of active production chapters sorted by warning severity' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: StudioOverviewResDto })
  overview(@ActiveUser('userId') userId: string) {
    return this.chapterService.studioOverview(userId)
  }
}
