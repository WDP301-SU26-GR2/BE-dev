import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { PublicRateLimitedException } from 'src/core/security/errors/public-rate-limit.error'
import { PublicRateLimitGuard } from 'src/core/security/guards/public-rate-limit.guard'
import {
  PublicChapterPagesResDto,
  PublicSeriesDetailResDto,
  PublicSeriesListQueryDto,
  PublicSeriesListResDto
} from './dto/public.dto'
import { PublicChapterNotFoundException, PublicSeriesNotFoundException } from './errors/public.errors'
import { PublicService } from './public.service'

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('series')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: 'Public catalog of post-serialization series with signed covers and chapter counts' })
  @ApiErrors(PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: PublicSeriesListResDto })
  listSeries(@Query() query: PublicSeriesListQueryDto) {
    return this.publicService.listSeries(query)
  }

  @Get('series/:id')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: 'Public series detail with PUBLISHED chapters' })
  @ApiErrors(PublicSeriesNotFoundException, PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: PublicSeriesDetailResDto })
  getSeriesDetail(@Param('id') id: string) {
    return this.publicService.getSeriesDetail(id)
  }

  @Get('chapters/:id/pages')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: 'Read a PUBLISHED chapter using short-lived signed page URLs and prev/next navigation' })
  @ApiErrors(PublicChapterNotFoundException, PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: PublicChapterPagesResDto })
  getChapterPages(@Param('id') id: string) {
    return this.publicService.getChapterPages(id)
  }
}
