import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { AppConfigService } from './app-config.service'
import { AppConfigResDto, PatchAppConfigBodyDto } from './dto/app-config.dto'

@ApiTags('app-config')
@ApiBearerAuth()
@Controller('admin/app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Super Admin reads runtime app configuration' })
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AppConfigResDto })
  get() {
    return this.appConfigService.get()
  }

  @Patch()
  @ApiOperation({ summary: 'Super Admin updates runtime app configuration' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AppConfigResDto })
  update(@Body() body: PatchAppConfigBodyDto, @ActiveUser('userId') adminId: string) {
    return this.appConfigService.update(adminId, body)
  }
}
