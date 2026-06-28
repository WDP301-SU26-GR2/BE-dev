import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { MessageResDto } from 'src/core/http/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/role.constant'
import {
  CreateProposalBodyDto,
  CreateProposalResDto,
  ListSeriesQueryDto,
  NameListResDto,
  NameResDto,
  ReasonBodyDto,
  SeriesListResDto,
  SeriesResDto,
  UpdateProposalBodyDto
} from './dto/series.dto'
import { SeriesService } from './series.service'

@ApiTags('series')
@ApiBearerAuth()
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ type: SeriesListResDto })
  listSeries(
    @Query() query: ListSeriesQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.seriesService.listSeries({ userId, roleName }, query)
  }

  @Get(':id')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ type: SeriesResDto })
  getSeries(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.seriesService.getSeries({ userId, roleName }, id)
  }

  @Get(':id/names')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ type: NameListResDto })
  listNames(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.seriesService.listNames({ userId, roleName }, id)
  }

  @Get(':id/names/:nameId')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ type: NameResDto })
  getName(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.seriesService.getName({ userId, roleName }, id, nameId)
  }

  @Post('proposals')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: CreateProposalResDto })
  createProposal(@Body() body: CreateProposalBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.createProposal(userId, body)
  }

  @Put('proposals/:id')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: SeriesResDto })
  updateProposal(@Param('id') id: string, @Body() body: UpdateProposalBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.updateProposal(userId, id, body)
  }

  @Delete('proposals/:id')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: MessageResDto })
  deleteProposal(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.deleteProposal(userId, id)
  }

  @Post(':id/submit')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: CreateProposalResDto })
  submit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.submit(userId, id)
  }

  @Post(':id/proposal/request-revision')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: SeriesResDto })
  requestProposalRevision(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.requestProposalRevision(userId, id, body.reason)
  }

  @Post(':id/proposal/resubmit')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: SeriesResDto })
  resubmitProposal(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.resubmitProposal(userId, id)
  }

  @Post(':id/proposal/approve')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: SeriesResDto })
  approveProposal(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.approveProposal(userId, id)
  }

  @Post(':id/reject')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: SeriesResDto })
  reject(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.rejectProposal(userId, id, body.reason)
  }

  @Post(':id/withdraw')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: SeriesResDto })
  withdraw(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.seriesService.withdraw(userId, id, body.reason)
  }

  @Post(':id/pitch')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: SeriesResDto })
  pitch(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.pitch(userId, id)
  }

  @Post(':id/claim')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: SeriesResDto })
  claim(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.claim(userId, id)
  }

  @Post(':id/release')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: SeriesResDto })
  release(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.release(userId, id)
  }
}
