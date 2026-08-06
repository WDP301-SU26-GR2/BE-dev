import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import {
  CreateMagazineBodyDto,
  MagazineEntryResDto,
  MagazineListResDto,
  UpdateMagazineBodyDto
} from '../dto/magazine.dto'
import { MagazineMessages } from '../magazine.messages'
import {
  MagazineAlreadyExistsException,
  MagazineInUseException,
  MagazineNotFoundException,
  PublicationTypeInUseException
} from '../errors/magazine.errors'
import { MagazineRegistryService } from '../services/magazine-registry.service'

// Danh mục tạp chí sống ở AppConfig. GET dùng path `/magazines` (Editor chọn khi mở quyết định
// serial hoá) nên KHÔNG gom dưới prefix `admin/` — dùng @Controller() + path đầy đủ (convention users.controller).
@ApiTags('magazines')
@ApiBearerAuth()
@Controller()
export class MagazineController {
  constructor(private readonly magazineRegistryService: MagazineRegistryService) {}

  @Get('magazines')
  @ApiOperation({ summary: 'Danh mục tạp chí hợp lệ — Editor/Hội đồng chọn khi mở quyết định serial hoá' })
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: MagazineListResDto })
  async getMagazines() {
    const items = await this.magazineRegistryService.getMagazines()
    return { items }
  }

  @Post('admin/magazines')
  @ApiOperation({ summary: 'Super Admin thêm tạp chí vào danh mục' })
  @Roles(RoleName.SUPER_ADMIN)
  @ApiErrors(MagazineAlreadyExistsException)
  @ZodResponse({ status: 201, type: MagazineEntryResDto })
  async createMagazine(@Body() body: CreateMagazineBodyDto, @ActiveUser('userId') adminId: string) {
    return this.magazineRegistryService.createMagazine(body.name, body.publicationTypes, adminId)
  }

  @Patch('admin/magazines/:name')
  @ApiOperation({
    summary:
      'Super Admin sửa nhịp phát hành tạp chí — gửi TRẠNG THÁI CUỐI của mảng (replace, không add/remove từng nhịp)'
  })
  @ApiParam({ name: 'name', description: 'Tên tạp chí (đã normalize)' })
  @Roles(RoleName.SUPER_ADMIN)
  @ApiErrors(MagazineNotFoundException, PublicationTypeInUseException)
  @ZodResponse({ status: 200, type: MagazineEntryResDto })
  async updateMagazine(
    @Param('name') name: string,
    @Body() body: UpdateMagazineBodyDto,
    @ActiveUser('userId') adminId: string
  ) {
    return this.magazineRegistryService.updateMagazine(name, body.publicationTypes, adminId)
  }

  @Delete('admin/magazines/:name')
  @ApiOperation({ summary: 'Super Admin xoá tạp chí khỏi danh mục (chặn nếu đang có series/kỳ bình chọn dùng)' })
  @ApiParam({ name: 'name', description: 'Tên tạp chí (đã normalize)' })
  @Roles(RoleName.SUPER_ADMIN)
  @ApiErrors(MagazineNotFoundException, MagazineInUseException)
  @ZodResponse({ status: 200, type: MessageResDto })
  async deleteMagazine(@Param('name') name: string, @ActiveUser('userId') adminId: string) {
    await this.magazineRegistryService.deleteMagazine(name, adminId)
    return { message: MagazineMessages.response.magazineDeleted }
  }
}
