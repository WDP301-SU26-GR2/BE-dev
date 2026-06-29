import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  AdminCreateUserBodyDto,
  AdminCreateUserResDto,
  AdminUserListResDto,
  AdminUserResDto,
  AssistantDirectoryListResDto,
  AssistantProfileBodyDto,
  AssistantProfileResDto,
  ListAssistantsQueryDto,
  ListUsersQueryDto,
  MangakaProfileBodyDto,
  MangakaProfileResDto
} from './dto/users.dto'
import { ProfileNotFoundException, UserEmailExistsException, UserNotFoundException } from './errors/users.errors'
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
}
