import { Body, Controller, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { SeriesSlotAdminService } from './services/series-slot-admin.service'
import { UpdateSeriesSlotBodyDto } from './dto/series.dto'
import { SeriesMessages } from './series.messages'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { SeriesNotFoundException, SeriesSlotNotEditableException } from './errors/series.errors'
import {
  MagazineNotRegisteredException,
  PublicationTypeNotSupportedException
} from '../magazine/errors/magazine.errors'

@ApiTags('admin/series')
@ApiBearerAuth()
@Controller('admin/series')
export class SeriesAdminController {
  constructor(private readonly slotAdminService: SeriesSlotAdminService) {}

  @Patch(':id/slot')
  @ApiOperation({ summary: 'Super Admin sửa slot bộ truyện (magazine, startIssueNumber, publicationType)' })
  @Roles(RoleName.SUPER_ADMIN)
  @ApiErrors(
    SeriesNotFoundException,
    SeriesSlotNotEditableException,
    MagazineNotRegisteredException,
    PublicationTypeNotSupportedException
  )
  @ZodResponse({ status: 200, type: MessageResDto })
  async updateSlot(
    @Param('id') id: string,
    @Body() body: UpdateSeriesSlotBodyDto,
    @ActiveUser('userId') adminId: string
  ) {
    await this.slotAdminService.updateSlot(id, body, adminId)
    return { message: SeriesMessages.response.slotCorrected }
  }
}
