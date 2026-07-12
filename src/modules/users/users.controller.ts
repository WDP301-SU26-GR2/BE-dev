import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  AdminCreateUserBodyDto,
  AdminCreateUserResDto,
  AdminResetPasswordResDto,
  AdminStatsResDto,
  AdminUpdateUserStatusBodyDto,
  AdminUserListResDto,
  AdminUserResDto,
  AssistantDirectoryListResDto,
  AssistantProfileBodyDto,
  AssistantProfileResDto,
  ListAssistantsQueryDto,
  ListUsersQueryDto,
  MangakaProfileBodyDto,
  MangakaProfileResDto,
  MeResDto,
  StaffProfileBodyDto,
  StaffProfileResDto,
  UpdateMeBodyDto
} from './dto/users.dto'
import {
  CannotModifyAdminUserException,
  ProfileNotFoundException,
  UserAlreadyDeletedException,
  UserEmailExistsException,
  UserNotDeletedException,
  UserNotFoundException
} from './errors/users.errors'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('admin/users')
  @ApiOperation({
    summary: 'Super Admin tạo Editor/Board → status=ACTIVE, registrationType=ADMIN_CREATED, mật khẩu tạm'
  })
  @ApiResponse({ status: 422, description: 'Validation (roleCode chỉ EDITOR/BOARD_MEMBER)' })
  @ApiErrors(UserEmailExistsException)
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 201, type: AdminCreateUserResDto })
  createUser(@Body() body: AdminCreateUserBodyDto) {
    return this.usersService.createUserByAdmin(body)
  }

  @Get('admin/users')
  @ApiOperation({
    summary: 'Super Admin liệt kê user (filter roleCode/status/search, phân trang, ẩn chính mình + soft-deleted)'
  })
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AdminUserListResDto })
  listUsers(@Query() query: ListUsersQueryDto, @ActiveUser('userId') userId: string) {
    return this.usersService.listUsers(userId, query)
  }

  @Get('admin/users/:id')
  @ApiOperation({ summary: 'Super Admin xem chi tiết 1 user' })
  @ApiErrors(UserNotFoundException)
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AdminUserResDto })
  getUser(@Param('id') id: string) {
    return this.usersService.getUserById(id)
  }

  @Patch('admin/users/:id/status')
  @ApiOperation({
    summary: 'Super Admin ban/block/unban user (ACTIVE/BANNED/BLOCKED) — phạt thì revoke refresh + notify'
  })
  @ApiResponse({ status: 422, description: 'Validation fail (status không nhận INACTIVE)' })
  @ApiErrors(UserNotFoundException, CannotModifyAdminUserException)
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AdminUserResDto })
  updateUserStatus(
    @Param('id') id: string,
    @Body() body: AdminUpdateUserStatusBodyDto,
    @ActiveUser('userId') adminId: string
  ) {
    return this.usersService.updateUserStatus(id, body, adminId)
  }

  @Delete('admin/users/:id')
  @ApiOperation({ summary: 'Super Admin xóa mềm user (set deletedAt) + thu hồi toàn bộ refresh token' })
  @ApiErrors(UserNotFoundException, CannotModifyAdminUserException, UserAlreadyDeletedException)
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: MessageResDto })
  deleteUser(@Param('id') id: string, @ActiveUser('userId') adminId: string) {
    return this.usersService.deleteUser(id, adminId)
  }

  @Post('admin/users/:id/restore')
  @ApiOperation({ summary: 'Super Admin khôi phục user đã xóa mềm (unset deletedAt — về absent)' })
  @ApiErrors(UserNotFoundException, CannotModifyAdminUserException, UserNotDeletedException)
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 201, type: AdminUserResDto })
  restoreUser(@Param('id') id: string, @ActiveUser('userId') adminId: string) {
    return this.usersService.restoreUser(id, adminId)
  }

  @Post('admin/users/:id/reset-password')
  @ApiOperation({
    summary: 'Super Admin cấp mật khẩu tạm (trả 1 lần) + mustChangePassword + revoke refresh + email best-effort'
  })
  @ApiErrors(UserNotFoundException, CannotModifyAdminUserException)
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 201, type: AdminResetPasswordResDto })
  resetUserPassword(@Param('id') id: string, @ActiveUser('userId') adminId: string) {
    return this.usersService.resetUserPassword(id, adminId)
  }

  @Get('admin/stats')
  @ApiOperation({ summary: 'Super Admin: số liệu tổng quan users/series/chapters/tasks (groupBy snapshot)' })
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AdminStatsResDto })
  getAdminStats() {
    return this.usersService.getAdminStats()
  }

  @Get('me')
  @ApiOperation({ summary: 'Xem thông tin tài khoản của chính mình (mọi role)' })
  @ApiErrors(UserNotFoundException)
  @ZodResponse({ status: 200, type: MeResDto })
  getMe(@ActiveUser('userId') userId: string) {
    return this.usersService.getMe(userId)
  }

  @Patch('me')
  @ApiOperation({
    summary:
      "Cập nhật thông tin tài khoản của chính mình (name/displayName/avatar/phoneNumber). '' = xoá field nullable"
  })
  @ApiErrors(UserNotFoundException)
  @ApiResponse({ status: 422, description: 'Validation fail (gửi email/role/status → strict reject)' })
  @ZodResponse({ status: 200, type: MeResDto })
  updateMe(@Body() body: UpdateMeBodyDto, @ActiveUser('userId') userId: string) {
    return this.usersService.updateMe(userId, body)
  }

  @Put('me/mangaka-profile')
  @ApiOperation({ summary: 'Mangaka tạo/cập nhật hồ sơ của mình (penName/genres/level/bio/portfolio) — lazy 1:1' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MangakaProfileResDto })
  upsertMangakaProfile(@Body() body: MangakaProfileBodyDto, @ActiveUser('userId') userId: string) {
    return this.usersService.upsertMangakaProfile(userId, body)
  }

  @Get('me/mangaka-profile')
  @ApiOperation({ summary: 'Mangaka xem hồ sơ của mình' })
  @ApiErrors(ProfileNotFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MangakaProfileResDto })
  getMyMangakaProfile(@ActiveUser('userId') userId: string) {
    return this.usersService.getMyMangakaProfile(userId)
  }

  @Put('me/assistant-profile')
  @ApiOperation({ summary: 'Assistant tạo/cập nhật hồ sơ của mình (specializations/level/availability) — lazy 1:1' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AssistantProfileResDto })
  upsertAssistantProfile(@Body() body: AssistantProfileBodyDto, @ActiveUser('userId') userId: string) {
    return this.usersService.upsertAssistantProfile(userId, body)
  }

  @Get('me/assistant-profile')
  @ApiOperation({ summary: 'Assistant xem hồ sơ của mình' })
  @ApiErrors(ProfileNotFoundException)
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AssistantProfileResDto })
  getMyAssistantProfile(@ActiveUser('userId') userId: string) {
    return this.usersService.getMyAssistantProfile(userId)
  }

  @Get('mangakas/:userId')
  @ApiOperation({ summary: 'Xem hồ sơ Mangaka công khai (kèm reputation)' })
  @ApiErrors(ProfileNotFoundException)
  @ZodResponse({ status: 200, type: MangakaProfileResDto })
  getMangakaProfile(@Param('userId') userId: string) {
    return this.usersService.getMangakaProfile(userId)
  }

  @Get('assistants')
  @ApiOperation({
    summary: 'Danh bạ trợ lý: lọc specialization/level/availability, ưu tiên isRecommended/reputation (ẩn email/phone)'
  })
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AssistantDirectoryListResDto })
  listAssistants(@Query() query: ListAssistantsQueryDto) {
    return this.usersService.listAssistants(query)
  }

  @Get('assistants/:userId')
  @ApiOperation({ summary: 'Xem hồ sơ Assistant công khai (danh bạ; kèm reputation/availability)' })
  @ApiErrors(ProfileNotFoundException)
  @ZodResponse({ status: 200, type: AssistantProfileResDto })
  getAssistantProfile(@Param('userId') userId: string) {
    return this.usersService.getAssistantProfile(userId)
  }

  @Put('me/staff-profile')
  @ApiOperation({
    summary: 'Editor/Board tạo/cập nhật hồ sơ của mình (specialtyGenres/demographics/bio) — lazy 1:1'
  })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: StaffProfileResDto })
  upsertStaffProfile(@Body() body: StaffProfileBodyDto, @ActiveUser('userId') userId: string) {
    return this.usersService.upsertStaffProfile(userId, body)
  }

  @Get('me/staff-profile')
  @ApiOperation({ summary: 'Editor/Board xem hồ sơ của mình' })
  @ApiErrors(ProfileNotFoundException)
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: StaffProfileResDto })
  getMyStaffProfile(@ActiveUser('userId') userId: string) {
    return this.usersService.getMyStaffProfile(userId)
  }

  @Get('staff/:userId')
  @ApiOperation({ summary: 'Xem hồ sơ Editor/Board công khai (ẩn email/phone)' })
  @ApiErrors(ProfileNotFoundException)
  @ZodResponse({ status: 200, type: StaffProfileResDto })
  getStaffProfile(@Param('userId') userId: string) {
    return this.usersService.getStaffProfile(userId)
  }
}
