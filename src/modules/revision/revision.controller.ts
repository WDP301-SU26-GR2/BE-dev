import { Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ListRevisionRequestsQueryDto, RevisionRequestListResDto, RevisionRequestResDto } from './dto/revision.dto'
import { NotRevisionRecipientException, RevisionRequestNotFoundException } from './errors/revision.errors'
import { RevisionService } from './revision.service'

@ApiTags('revision')
@ApiBearerAuth()
@Controller('revision-requests')
export class RevisionController {
  constructor(private readonly revisionService: RevisionService) {}

  @Get()
  @ApiOperation({
    summary: 'Liệt kê vòng yêu cầu sửa (scope: mình yêu cầu hoặc mình phải sửa; Board/Admin xem tất cả)'
  })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: RevisionRequestListResDto })
  list(
    @Query() query: ListRevisionRequestsQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.revisionService.list({ userId, roleName }, query)
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Người phải sửa đánh dấu vòng yêu cầu sửa đã hoàn thành (idempotent)' })
  @ApiErrors(RevisionRequestNotFoundException, NotRevisionRecipientException)
  @Roles(RoleName.MANGAKA, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: RevisionRequestResDto })
  resolve(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.revisionService.resolve(userId, id)
  }
}
