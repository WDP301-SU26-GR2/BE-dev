import { createZodDto } from 'nestjs-zod'
import {
  CreateReprintRequestBodySchema,
  MangakaReviewReprintBodySchema,
  BoardApproveReprintBodySchema,
  SubmitChapterManuscriptBodySchema,
  EditorApproveChapterBodySchema
} from '../schemas/reprint-request-schema'

export class CreateReprintRequestBodyDto extends createZodDto(CreateReprintRequestBodySchema) {}
export class MangakaReviewReprintBodyDto extends createZodDto(MangakaReviewReprintBodySchema) {}
export class BoardApproveReprintBodyDto extends createZodDto(BoardApproveReprintBodySchema) {}
export class SubmitChapterManuscriptBodyDto extends createZodDto(SubmitChapterManuscriptBodySchema) {}
export class EditorApproveChapterBodyDto extends createZodDto(EditorApproveChapterBodySchema) {}
