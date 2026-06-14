import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { ActiveUser } from 'src/shared/decorators/active-user.decorator'
import { IsPublic } from 'src/shared/decorators/auth.decorator'
import type { JwtAccessTokenPayload } from 'src/shared/types/jwt.type'
import { GetUserByIdParamsDto, UpdateProfileBodyDto } from './dto/users.dto'

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @IsPublic()
  getUserById(@Param() params: GetUserByIdParamsDto) {
    return this.usersService.getUserById(params.id)
  }

  @Get('me')
  getMyProfile(@ActiveUser() user: JwtAccessTokenPayload) {
    return this.usersService.getMyProfile(user.userId)
  }

  @Patch('me')
  updateMyProfile(@ActiveUser() user: JwtAccessTokenPayload, @Body() body: UpdateProfileBodyDto) {
    return this.usersService.updateMyProfile(user.userId, body)
  }
}
