import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { AuditService } from './audit.service'
import { AuditLogListResDto, ListAuditLogsQueryDto } from './dto/audit.dto'

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs for privileged audit viewers' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @Roles(RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: AuditLogListResDto })
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.query(query)
  }
}
