import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  BatchCreateTaskBodyDto,
  CreateTaskGroupBodyDto,
  TaskGroupResDto,
  ApproveTaskGroupResDto,
  CancelTaskBodyDto,
  CreateRegionBodyDto,
  CreateTaskBodyDto,
  DeleteRegionResDto,
  ListTasksQueryDto,
  ReassignTaskBodyDto,
  RegionListResDto,
  RegionResDto,
  RequestRevisionBodyDto,
  SubmitTaskBodyDto,
  TaskListResDto,
  TaskResDto,
  UpdateRegionBodyDto,
  UpdateTaskBodyDto
} from './dto/task.dto'
import {
  AssetNotFoundException,
  AssistantNotHiredException,
  ChapterOnHoldTaskException,
  InvalidTaskTransitionException,
  NotSeriesOwnerException,
  NotTaskAssigneeException,
  PageNotEditableTaskException,
  PageNotFoundException,
  RegionHasApprovedTasksException,
  RegionNotFoundException,
  TaskNotFoundException,
  TaskNotCancellableException,
  TaskNotReassignableException
} from './errors/task.errors'
import { TaskService } from './task.service'

@ApiTags('task')
@ApiBearerAuth()
@Controller()
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  // ---- Region (A-TSK-01/02) ----
  @Post('pages/:id/regions')
  @ApiOperation({ summary: 'Mangaka khoanh vùng manual trên trang → Region' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(PageNotFoundException, NotSeriesOwnerException, ChapterOnHoldTaskException, PageNotEditableTaskException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: RegionResDto })
  createRegion(
    @Param('id') pageId: string,
    @Body() body: CreateRegionBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof RegionResDto>> {
    return this.taskService.createRegion(userId, pageId, body)
  }

  @Get('pages/:id/regions')
  @ApiOperation({ summary: 'Danh sách vùng của 1 trang (Mangaka sở hữu / Editor)' })
  @ApiErrors(PageNotFoundException, NotSeriesOwnerException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: RegionListResDto })
  listRegions(
    @Param('id') pageId: string,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof RegionListResDto>> {
    return this.taskService.listRegions(userId, pageId)
  }

  @Patch('regions/:id')
  @ApiOperation({ summary: 'Sửa vùng (partial)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(RegionNotFoundException, NotSeriesOwnerException, ChapterOnHoldTaskException, PageNotEditableTaskException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: RegionResDto })
  updateRegion(
    @Param('id') id: string,
    @Body() body: UpdateRegionBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof RegionResDto>> {
    return this.taskService.updateRegion(userId, id, body)
  }

  @Delete('regions/:id')
  @ApiOperation({
    summary: 'Xoá vùng → cascade CANCELLED task chưa kết thúc + notify Assistant (chặn nếu có APPROVED)'
  })
  @ApiErrors(
    RegionNotFoundException,
    NotSeriesOwnerException,
    RegionHasApprovedTasksException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: DeleteRegionResDto })
  removeRegion(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof DeleteRegionResDto>> {
    return this.taskService.removeRegion(userId, id)
  }

  // ---- Task (A-TSK-03/09) ----
  @Post('tasks')
  @ApiOperation({ summary: 'Giao task cho Assistant (enforce BR-ASSIST-01)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    PageNotFoundException,
    NotSeriesOwnerException,
    AssistantNotHiredException,
    AssetNotFoundException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskResDto })
  createTask(
    @Body() body: CreateTaskBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.createTask(userId, body)
  }

  @Post('tasks/batch')
  @ApiOperation({ summary: 'Giao nhiều task (all-or-nothing)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    PageNotFoundException,
    NotSeriesOwnerException,
    AssistantNotHiredException,
    AssetNotFoundException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskListResDto })
  createTaskBatch(
    @Body() body: BatchCreateTaskBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskListResDto>> {
    return this.taskService.createTaskBatch(userId, body)
  }

  @Post('tasks/group')
  @ApiOperation({
    summary:
      'Giao MỘT đầu việc trải nhiều trang (vd "vẽ nền ch.5 trang 1-10"). Backend tạo N task — mỗi trang 1 task — ' +
      'dùng chung groupId; all-or-nothing. Region/tiến độ/duyệt vẫn theo từng trang.'
  })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    PageNotFoundException,
    NotSeriesOwnerException,
    AssistantNotHiredException,
    AssetNotFoundException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskGroupResDto })
  createTaskGroup(
    @Body() body: CreateTaskGroupBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskGroupResDto>> {
    return this.taskService.createTaskGroup(userId, body)
  }

  @Post('tasks/group/:groupId/approve')
  @ApiOperation({
    summary:
      'Duyệt cả nhóm việc. Chỉ duyệt task đang SUBMITTED/UNDER_REVIEW; task chưa tới lượt được liệt kê ở `skipped`.'
  })
  @ApiErrors(TaskNotFoundException, NotSeriesOwnerException, ChapterOnHoldTaskException, PageNotEditableTaskException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ApproveTaskGroupResDto })
  approveTaskGroup(
    @Param('groupId') groupId: string,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof ApproveTaskGroupResDto>> {
    return this.taskService.approveTaskGroup(userId, groupId)
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Sửa task (assetIds/deadline/priority)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TaskNotFoundException,
    NotSeriesOwnerException,
    AssetNotFoundException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: TaskResDto })
  updateTask(
    @Param('id') id: string,
    @Body() body: UpdateTaskBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.updateTask(userId, id, body)
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Chi tiết task (Mangaka sở hữu / Assistant được giao)' })
  @ApiErrors(TaskNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: TaskResDto })
  getTask(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.getTask(userId, roleName, id)
  }

  @Get('tasks')
  @ApiOperation({
    summary:
      'Danh sách task. Assistant = task được giao cho mình; Mangaka = task thuộc mọi series mình sở hữu ' +
      '(KHÔNG cần pageId), lọc dần bằng seriesId/chapterId/pageId/assistantId/status. ' +
      'Scope không thuộc mình → trả rỗng, không 403.'
  })
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: TaskListResDto })
  listTasks(
    @Query() query: ListTasksQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ): Promise<InstanceType<typeof TaskListResDto>> {
    return this.taskService.listTasks(userId, roleName, query)
  }

  // ---- Review (A-TSK-04) ----
  @Post('tasks/:id/start')
  @ApiOperation({ summary: 'Assistant bắt đầu xử lý task → IN_PROGRESS (SRS §2.2a)' })
  @ApiErrors(
    TaskNotFoundException,
    PageNotFoundException,
    NotTaskAssigneeException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException,
    InvalidTaskTransitionException
  )
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 201, type: TaskResDto })
  startTask(@Param('id') id: string, @ActiveUser('userId') userId: string): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.startTask(userId, id)
  }

  @Post('tasks/:id/submit')
  @ApiOperation({ summary: 'Assistant nộp kết quả → SUBMITTED + TaskVersion' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TaskNotFoundException,
    PageNotFoundException,
    NotTaskAssigneeException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException,
    InvalidTaskTransitionException
  )
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 201, type: TaskResDto })
  submitTask(
    @Param('id') id: string,
    @Body() body: SubmitTaskBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.submitTask(userId, id, body)
  }

  @Post('tasks/:id/approve')
  @ApiOperation({ summary: 'Mangaka duyệt task → APPROVED' })
  @ApiErrors(
    TaskNotFoundException,
    PageNotFoundException,
    NotSeriesOwnerException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException,
    InvalidTaskTransitionException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskResDto })
  approveTask(@Param('id') id: string, @ActiveUser('userId') userId: string): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.approveTask(userId, id)
  }

  @Post('tasks/:id/request-revision')
  @ApiOperation({ summary: 'Mangaka yêu cầu sửa → REVISION_REQUESTED (markup riêng qua /annotations)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TaskNotFoundException,
    PageNotFoundException,
    NotSeriesOwnerException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException,
    InvalidTaskTransitionException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskResDto })
  requestRevision(
    @Param('id') id: string,
    @Body() body: RequestRevisionBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.requestRevision(userId, id, body)
  }

  @Post('tasks/:id/cancel')
  @ApiOperation({ summary: 'Mangaka cancels a non-terminal task -> CANCELLED and notifies assigned Assistant' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TaskNotFoundException, NotSeriesOwnerException, PageNotEditableTaskException, TaskNotCancellableException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskResDto })
  cancelTask(
    @Param('id') id: string,
    @Body() body: CancelTaskBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.cancelTask(userId, id, body)
  }

  // ---- Reassign (A-TSK-05) ----
  @Post('tasks/:id/reassign')
  @ApiOperation({
    summary: 'Giao lại task (ASSIGNED/IN_PROGRESS/REVISION_REQUESTED/ON_HOLD) cho Assistant khác → ASSIGNED'
  })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TaskNotFoundException,
    NotSeriesOwnerException,
    TaskNotReassignableException,
    AssistantNotHiredException,
    ChapterOnHoldTaskException,
    PageNotEditableTaskException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TaskResDto })
  reassignTask(
    @Param('id') id: string,
    @Body() body: ReassignTaskBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<InstanceType<typeof TaskResDto>> {
    return this.taskService.reassignTask(userId, id, body)
  }
}
