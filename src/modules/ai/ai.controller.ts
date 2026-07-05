import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { NotSeriesOwnerException, PageNotFoundException } from 'src/modules/task/errors/task.errors'
import { ChapterOnHoldTaskException } from 'src/modules/task/errors/task.errors'
import { AiService } from './ai.service'
import {
  AiJobListResDto,
  AiJobResDto,
  ApplyAiJobResDto,
  ListAiJobsQueryDto,
  SegmentAcceptedResDto,
  SegmentPageBodyDto
} from './dto/ai.dto'
import {
  AiEnqueueFailedException,
  AiJobNotApplicableException,
  AiJobNotFoundException,
  AiNotEnabledException,
  PageHasNoFileException,
  SegmentJobAlreadyRunningException
} from './errors/ai.errors'

@ApiTags('ai')
@ApiBearerAuth()
@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('pages/:id/segment')
  @ApiOperation({ summary: 'Run async AI page segmentation and return a job id for polling' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    PageNotFoundException,
    NotSeriesOwnerException,
    PageHasNoFileException,
    AiNotEnabledException,
    SegmentJobAlreadyRunningException,
    AiEnqueueFailedException,
    ChapterOnHoldTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: SegmentAcceptedResDto })
  segment(
    @Param('id') pageId: string,
    @Body() body: SegmentPageBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof SegmentAcceptedResDto>> {
    return this.aiService.requestSegment(userId, pageId, body)
  }

  @Get('ai-jobs/:id')
  @ApiOperation({ summary: 'Poll one AI job status and proposed regions' })
  @ApiErrors(AiJobNotFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: AiJobResDto })
  getJob(@Param('id') id: string, @ActiveUser('userId') userId: string): Promise<InstanceType<typeof AiJobResDto>> {
    return this.aiService.getJob(userId, id)
  }

  @Get('pages/:id/ai-jobs')
  @ApiOperation({ summary: 'List AI proposals for one page without proposedRegions payload' })
  @ApiErrors(PageNotFoundException, NotSeriesOwnerException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: AiJobListResDto })
  listJobs(
    @Param('id') pageId: string,
    @Query() query: ListAiJobsQueryDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof AiJobListResDto>> {
    return this.aiService.listJobs(userId, pageId, query)
  }

  @Post('ai-jobs/:id/apply')
  @ApiOperation({
    summary: 'Apply one AI proposal into Region[] while preserving manual/confirmed/task-linked regions'
  })
  @ApiErrors(
    AiJobNotFoundException,
    AiJobNotApplicableException,
    PageNotFoundException,
    NotSeriesOwnerException,
    ChapterOnHoldTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ApplyAiJobResDto })
  applyJob(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof ApplyAiJobResDto>> {
    return this.aiService.applyJob(userId, id)
  }
}
