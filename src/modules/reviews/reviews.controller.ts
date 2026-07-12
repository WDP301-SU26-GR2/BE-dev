import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  CreateAssistantReviewBodyDto,
  CreateMangakaReviewBodyDto,
  ListAssistantReviewsQueryDto,
  ListMangakaReviewsQueryDto,
  ReviewListResDto,
  ReviewResDto
} from './dto/reviews.dto'
import { CannotReviewSelfException, ReviewRequiresEndedAssignmentException } from './errors/reviews.errors'
import { ProfileNotFoundException } from 'src/modules/users/errors/users.errors'
import { ReviewsService } from './reviews.service'

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('assistant-reviews')
  @ApiOperation({
    summary: 'Mangaka đánh giá Assistant (rating 1-5 + comment) sau StudioAssignment → feed reputation (A-AUTH-07)'
  })
  @ApiErrors(CannotReviewSelfException, ReviewRequiresEndedAssignmentException, ProfileNotFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ReviewResDto })
  createAssistantReview(@Body() body: CreateAssistantReviewBodyDto, @ActiveUser('userId') userId: string) {
    return this.reviewsService.createAssistantReview(userId, body)
  }

  @Get('assistant-reviews')
  @ApiOperation({ summary: 'List review của 1 Assistant (phân trang)' })
  @ZodResponse({ status: 200, type: ReviewListResDto })
  listAssistantReviews(@Query() query: ListAssistantReviewsQueryDto) {
    return this.reviewsService.listAssistantReviews(query.assistantId, {
      limit: query.limit,
      offset: query.offset
    })
  }

  @Post('mangaka-reviews')
  @ApiOperation({
    summary: 'Editor đánh giá Mangaka (rating 1-5 + comment) sau series/hợp tác → feed reputation (A-AUTH-07)'
  })
  @ApiErrors(CannotReviewSelfException, ProfileNotFoundException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ReviewResDto })
  createMangakaReview(@Body() body: CreateMangakaReviewBodyDto, @ActiveUser('userId') userId: string) {
    return this.reviewsService.createMangakaReview(userId, body)
  }

  @Get('mangaka-reviews')
  @ApiOperation({ summary: 'List review của 1 Mangaka (phân trang)' })
  @ZodResponse({ status: 200, type: ReviewListResDto })
  listMangakaReviews(@Query() query: ListMangakaReviewsQueryDto) {
    return this.reviewsService.listMangakaReviews(query.mangakaId, {
      limit: query.limit,
      offset: query.offset
    })
  }
}
