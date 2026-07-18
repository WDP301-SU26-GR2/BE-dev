import { createZodDto } from 'nestjs-zod'
import {
  AdminDashboardResSchema,
  AssistantDashboardResSchema,
  BoardDashboardResSchema,
  EditorDashboardResSchema,
  MangakaDashboardResSchema,
  MangakaEarningsResSchema
} from '../schemas/dashboard-schemas'

export class MangakaDashboardResDto extends createZodDto(MangakaDashboardResSchema) {}
export class MangakaEarningsResDto extends createZodDto(MangakaEarningsResSchema) {}
export class AssistantDashboardResDto extends createZodDto(AssistantDashboardResSchema) {}
export class EditorDashboardResDto extends createZodDto(EditorDashboardResSchema) {}
export class BoardDashboardResDto extends createZodDto(BoardDashboardResSchema) {}
export class AdminDashboardResDto extends createZodDto(AdminDashboardResSchema) {}
