import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/role.constant'
import {
  ChapterListResDto,
  ChapterResDto,
  CreateChapterBodyDto,
  CreatePageBodyDto,
  ExtendDeadlineBodyDto,
  PageListResDto,
  PageResDto,
  ReasonBodyDto,
  SetScheduleBodyDto,
  UpdatePageBodyDto
} from './dto/chapter.dto'
import { ChapterService } from './chapter.service'

@ApiTags('chapters')
@ApiBearerAuth()
@Controller()
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post('chapters')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: ChapterResDto })
  create(@Body() body: CreateChapterBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.create(userId, body)
  }

  @Get('chapters')
  @ZodResponse({ type: ChapterListResDto })
  listBySeries(@Query('seriesId') seriesId: string) {
    return this.chapterService.listBySeries(seriesId)
  }

  @Get('chapters/:id')
  @ZodResponse({ type: ChapterResDto })
  getOne(@Param('id') id: string) {
    return this.chapterService.getOne(id)
  }

  @Put('chapters/:id/schedule')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: ChapterResDto })
  setSchedule(@Param('id') id: string, @Body() body: SetScheduleBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.setSchedule(userId, id, body)
  }

  @Patch('chapters/:id/schedule/extend')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: ChapterResDto })
  extend(@Param('id') id: string, @Body() body: ExtendDeadlineBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.extendDeadline(userId, id, body)
  }

  @Post('chapters/:id/pages')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: PageResDto })
  createPage(@Param('id') id: string, @Body() body: CreatePageBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.createPage(userId, id, body)
  }

  @Get('chapters/:id/pages')
  @ZodResponse({ type: PageListResDto })
  listPages(@Param('id') id: string) {
    return this.chapterService.listPages(id)
  }

  @Patch('pages/:pageId')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: PageResDto })
  updatePage(@Param('pageId') pageId: string, @Body() body: UpdatePageBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.updatePage(userId, pageId, body)
  }

  @Post('chapters/:id/manuscript/mark-composite-ready')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: ChapterResDto })
  markCompositeReady(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.markCompositeReady(userId, id)
  }

  @Post('chapters/:id/manuscript/submit')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: ChapterResDto })
  submit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.submit(userId, id)
  }

  @Post('chapters/:id/manuscript/request-revision')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: ChapterResDto })
  requestRevision(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.requestRevision(userId, id, body.reason)
  }

  @Post('chapters/:id/manuscript/resubmit')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: ChapterResDto })
  resubmit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.resubmit(userId, id)
  }

  @Post('chapters/:id/manuscript/approve')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: ChapterResDto })
  approve(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.approve(userId, id)
  }

  @Post('chapters/:id/publish')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: ChapterResDto })
  publish(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.publish(userId, id)
  }
}
