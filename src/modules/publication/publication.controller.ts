import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { PublicationService } from './publication.service'
import {
  CreatePublicationVersionBodyDto,
  PublicationVersionListResDto,
  PublicationVersionResDto,
  UpdatePublicationVersionBodyDto
} from './dto/publication.dto'
import {
  PublicationVersionNotFoundException,
  SeriesAccessDeniedException,
  SeriesNotFoundException
} from './errors/publication.errors'

@ApiTags('publication-versions')
@ApiBearerAuth()
@Controller()
export class PublicationController {
  constructor(private readonly service: PublicationService) {}

  @Post('series/:seriesId/publication-versions')
  @ApiOperation({ summary: 'B-PUB-01: Tạo phiên bản phát hành cho series (Flow 13)' })
  @ApiErrors(SeriesNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 201, type: PublicationVersionResDto })
  create(
    @Param('seriesId') seriesId: string,
    @Body() body: CreatePublicationVersionBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.service.create(userId, roleName, seriesId, body)
  }

  @Get('series/:seriesId/publication-versions')
  @ApiOperation({ summary: 'List phiên bản phát hành của series (scope theo role)' })
  @ApiErrors(SeriesNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN, RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: PublicationVersionListResDto })
  list(
    @Param('seriesId') seriesId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.service.listBySeries(userId, roleName, seriesId)
  }

  @Get('publication-versions/:id')
  @ApiOperation({ summary: 'Chi tiết 1 phiên bản phát hành' })
  @ApiErrors(PublicationVersionNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN, RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: PublicationVersionResDto })
  getOne(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.service.getById(userId, roleName, id)
  }

  @Patch('publication-versions/:id')
  @ApiOperation({ summary: 'Sửa (partial) phiên bản phát hành' })
  @ApiErrors(PublicationVersionNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PublicationVersionResDto })
  update(
    @Param('id') id: string,
    @Body() body: UpdatePublicationVersionBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.service.update(userId, roleName, id, body)
  }

  @Delete('publication-versions/:id')
  @ApiOperation({ summary: 'Xóa phiên bản phát hành' })
  @ApiErrors(PublicationVersionNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: MessageResDto })
  remove(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.service.remove(userId, roleName, id)
  }
}
