import { Body, Controller, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/role.constant'
import {
  CreateProposalBodyDto,
  CreateProposalResDto,
  ReasonBodyDto,
  SeriesResDto,
  UpdateProposalBodyDto
} from './dto/series.dto'
import { SeriesService } from './series.service'

@ApiTags('series')
@ApiBearerAuth()
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

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
}
