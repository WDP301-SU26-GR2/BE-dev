import { createZodDto } from 'nestjs-zod'
import {
  CreateAssistantReviewBodySchema,
  CreateMangakaReviewBodySchema,
  ListAssistantReviewsQuerySchema,
  ListMangakaReviewsQuerySchema,
  ReviewListResSchema,
  ReviewResSchema
} from '../schemas/reviews-schemas'

export class CreateAssistantReviewBodyDto extends createZodDto(CreateAssistantReviewBodySchema) {}
export class CreateMangakaReviewBodyDto extends createZodDto(CreateMangakaReviewBodySchema) {}
export class ListAssistantReviewsQueryDto extends createZodDto(ListAssistantReviewsQuerySchema) {}
export class ListMangakaReviewsQueryDto extends createZodDto(ListMangakaReviewsQuerySchema) {}
export class ReviewResDto extends createZodDto(ReviewResSchema) {}
export class ReviewListResDto extends createZodDto(ReviewListResSchema) {}
