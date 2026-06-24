import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/role.constant'
import {
  AdminCreateUserBodyDto,
  AdminCreateUserResDto,
  AssistantProfileBodyDto,
  AssistantProfileResDto,
  MangakaProfileBodyDto,
  MangakaProfileResDto
} from './dto/users.dto'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('admin/users')
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ type: AdminCreateUserResDto })
  createUser(@Body() body: AdminCreateUserBodyDto) {
    return this.usersService.createUserByAdmin(body)
  }

  @Put('me/mangaka-profile')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: MangakaProfileResDto })
  upsertMangakaProfile(@Body() body: MangakaProfileBodyDto, @ActiveUser('userId') userId: string) {
    return this.usersService.upsertMangakaProfile(userId, body)
  }

  @Get('me/mangaka-profile')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ type: MangakaProfileResDto })
  getMyMangakaProfile(@ActiveUser('userId') userId: string) {
    return this.usersService.getMyMangakaProfile(userId)
  }

  @Put('me/assistant-profile')
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ type: AssistantProfileResDto })
  upsertAssistantProfile(@Body() body: AssistantProfileBodyDto, @ActiveUser('userId') userId: string) {
    return this.usersService.upsertAssistantProfile(userId, body)
  }

  @Get('me/assistant-profile')
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ type: AssistantProfileResDto })
  getMyAssistantProfile(@ActiveUser('userId') userId: string) {
    return this.usersService.getMyAssistantProfile(userId)
  }

  @Get('mangakas/:userId')
  @ZodResponse({ type: MangakaProfileResDto })
  getMangakaProfile(@Param('userId') userId: string) {
    return this.usersService.getMangakaProfile(userId)
  }

  @Get('assistants/:userId')
  @ZodResponse({ type: AssistantProfileResDto })
  getAssistantProfile(@Param('userId') userId: string) {
    return this.usersService.getAssistantProfile(userId)
  }
}
