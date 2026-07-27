import { createZodDto } from 'nestjs-zod'
import {
  CreateReprintRequestBodySchema,
  MangakaReviewReprintBodySchema,
  BoardApproveReprintBodySchema,
  SubmitChapterManuscriptBodySchema,
  EditorApproveChapterBodySchema,
  AssignReviserBodySchema,
  ReprintRequestResSchema,
  ReprintRequestListItemSchema,
  ReprintRequestListResSchema,
  ReprintChapterResSchema,
  ReprintChapterListResSchema
} from '../schemas/reprint-request-schema'

export class CreateReprintRequestBodyDto extends createZodDto(CreateReprintRequestBodySchema) {}
export class MangakaReviewReprintBodyDto extends createZodDto(MangakaReviewReprintBodySchema) {}
export class BoardApproveReprintBodyDto extends createZodDto(BoardApproveReprintBodySchema) {}
export class SubmitChapterManuscriptBodyDto extends createZodDto(SubmitChapterManuscriptBodySchema) {}
export class EditorApproveChapterBodyDto extends createZodDto(EditorApproveChapterBodySchema) {}
export class AssignReviserBodyDto extends createZodDto(AssignReviserBodySchema) {}
export class ReprintRequestResDto extends createZodDto(ReprintRequestResSchema) {}
export class ReprintRequestListItemDto extends createZodDto(ReprintRequestListItemSchema) {}
export class ReprintRequestListResDto extends createZodDto(ReprintRequestListResSchema) {}
export class ReprintChapterResDto extends createZodDto(ReprintChapterResSchema) {}
export class ReprintChapterListResDto extends createZodDto(ReprintChapterListResSchema) {}
