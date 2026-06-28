import { Body, Controller, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/role.constant'
import { AddNamePageBodyDto, NameResDto, ReasonBodyDto, UpdateNamePagesBodyDto } from './dto/series.dto'
import { SeriesService } from './series.service'

@ApiTags('series-names')
@ApiBearerAuth()
@Controller('series/:id/names/:nameId')
export class NameController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post('request-revision')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: NameResDto })
  requestRevision(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: ReasonBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.requestNameRevision(userId, id, nameId, body.reason)
  }

  @Post('resubmit')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: NameResDto })
  resubmit(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.resubmitName(userId, id, nameId)
  }

  @Post('approve')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: NameResDto })
  approve(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.approveName(userId, id, nameId)
  }

  @Put('pages')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: NameResDto })
  updatePages(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: UpdateNamePagesBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.updateNamePages(userId, id, nameId, body)
  }

  @Post('pages')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: NameResDto })
  addPage(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: AddNamePageBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.addNamePage(userId, id, nameId, body)
  }
}
