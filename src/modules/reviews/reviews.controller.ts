import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/role.constant'
import {
  CreateAssistantReviewBodyDto,
  CreateMangakaReviewBodyDto,
  ListAssistantReviewsQueryDto,
  ListMangakaReviewsQueryDto,
  ReviewListResDto,
  ReviewResDto
} from './dto/reviews.dto'
import { ReviewsService } from './reviews.service'

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('assistant-reviews')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: ReviewResDto })
  createAssistantReview(@Body() body: CreateAssistantReviewBodyDto, @ActiveUser('userId') userId: string) {
    return this.reviewsService.createAssistantReview(userId, body)
  }

  @Get('assistant-reviews')
  @ZodResponse({ type: ReviewListResDto })
  listAssistantReviews(@Query() query: ListAssistantReviewsQueryDto) {
    return this.reviewsService.listAssistantReviews(query.assistantId, {
      limit: query.limit,
      offset: query.offset
    })
  }

  @Post('mangaka-reviews')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ type: ReviewResDto })
  createMangakaReview(@Body() body: CreateMangakaReviewBodyDto, @ActiveUser('userId') userId: string) {
    return this.reviewsService.createMangakaReview(userId, body)
  }

  @Get('mangaka-reviews')
  @ZodResponse({ type: ReviewListResDto })
  listMangakaReviews(@Query() query: ListMangakaReviewsQueryDto) {
    return this.reviewsService.listMangakaReviews(query.mangakaId, {
      limit: query.limit,
      offset: query.offset
    })
  }
}
