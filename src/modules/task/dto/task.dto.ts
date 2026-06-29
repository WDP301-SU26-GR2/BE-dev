import { createZodDto } from 'nestjs-zod'
import {
  BatchCreateTaskBodySchema,
  CreateRegionBodySchema,
  CreateTaskBodySchema,
  ListTasksQuerySchema,
  RegionListResSchema,
  RegionResSchema,
  ReassignTaskBodySchema,
  RequestRevisionBodySchema,
  SubmitTaskBodySchema,
  TaskListResSchema,
  TaskResSchema,
  UpdateRegionBodySchema,
  UpdateTaskBodySchema
} from '../schemas/task-schemas'

export class CreateRegionBodyDto extends createZodDto(CreateRegionBodySchema) {}
export class UpdateRegionBodyDto extends createZodDto(UpdateRegionBodySchema) {}
export class RegionResDto extends createZodDto(RegionResSchema) {}
export class RegionListResDto extends createZodDto(RegionListResSchema) {}
export class CreateTaskBodyDto extends createZodDto(CreateTaskBodySchema) {}
export class BatchCreateTaskBodyDto extends createZodDto(BatchCreateTaskBodySchema) {}
export class UpdateTaskBodyDto extends createZodDto(UpdateTaskBodySchema) {}
export class SubmitTaskBodyDto extends createZodDto(SubmitTaskBodySchema) {}
export class RequestRevisionBodyDto extends createZodDto(RequestRevisionBodySchema) {}
export class ReassignTaskBodyDto extends createZodDto(ReassignTaskBodySchema) {}
export class TaskResDto extends createZodDto(TaskResSchema) {}
export class TaskListResDto extends createZodDto(TaskListResSchema) {}
export class ListTasksQueryDto extends createZodDto(ListTasksQuerySchema) {}
