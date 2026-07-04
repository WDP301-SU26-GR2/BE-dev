import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ContractService } from './services/contract.service'
import { CreateContractBodyDto, EditorUpdateContractBodyDto, SignContractWithOtpBodyDto } from './dto/contract.dto'
import { ContractStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator' // Đường dẫn import tùy thuộc dự án của bạn
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator' // Đường dẫn import tùy thuộc dự án của bạn

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @ApiOperation({ summary: 'Kiểm tra health của module contract' })
  @Get('health')
  health() {
    return this.contractService.healthCheck()
  }

  @ApiOperation({ summary: 'Lấy danh sách hợp đồng của người dùng' })
  @Get()
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  getContracts(@ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.contractService.getContracts(userId, roleName)
  }

  @ApiOperation({ summary: 'Lấy chi tiết hợp đồng theo id' })
  @Get(':id')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  getContractById(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.getContractById(id, userId, roleName)
  }

  @ApiOperation({ summary: 'Lấy danh sách các phiên bản của hợp đồng' })
  @Get(':id/versions')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  getContractVersions(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.getContractVersions(id, userId, roleName)
  }

  @ApiOperation({ summary: 'Lấy thông tin một phiên bản cụ thể của hợp đồng' })
  @Get(':id/versions/:versionId')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  getContractVersionById(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.contractService.getContractVersionById(id, versionId, userId, roleName)
  }

  // 1. Tạo mới tài nguyên hợp đồng nháp
  @ApiOperation({ summary: 'Tạo hợp đồng nháp mới cho series' })
  @Post()
  @Roles(RoleName.EDITOR)
  createDraft(@ActiveUser('userId') userId: string, @Body() dto: CreateContractBodyDto) {
    return this.contractService.createDraft(userId, dto)
  }

  // 2. Cập nhật chi tiết các điều khoản thương lượng hợp đồng
  @ApiOperation({ summary: 'Editor cập nhật điều khoản hợp đồng nháp' })
  @Patch(':id')
  @Roles(RoleName.EDITOR)
  updateContract(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @Body() dto: EditorUpdateContractBodyDto // Đưa note thẳng vào chung DTO phẳng giúp code gọn hơn
  ) {
    const { note, ...updateData } = dto
    return this.contractService.editorUpdateContract(id, userId, updateData, note)
  }

  // 3. Cập nhật trạng thái chu trình luồng đi hợp đồng
  @ApiOperation({ summary: 'Cập nhật trạng thái luồng hợp đồng' })
  @Patch(':id/status')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA)
  updateStatus(@Param('id') id: string, @ActiveUser('userId') userId: string, @Body('status') status: ContractStatus) {
    if (status === ContractStatus.MANGAKA_REVIEW) {
      return this.contractService.sendToMangaka(id, userId)
    }
    if (status === ContractStatus.MANGAKA_APPROVED) {
      return this.contractService.mangakaApprove(id)
    }
  }

  // 4. Tạo tài nguyên "Chữ ký số xác thực của Mangaka"
  @ApiOperation({ summary: 'Mangaka ký hợp đồng bằng mã OTP' })
  @Post(':id/signatures/mangaka')
  @Roles(RoleName.MANGAKA)
  signMangaka(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') userEmail: string,
    @Body() body: SignContractWithOtpBodyDto
  ) {
    return this.contractService.signByMangakaWithOtp(id, userId, userEmail, body.otpCode)
  }

  // 5. Tạo tài nguyên "Chữ ký số đồng thuận của Ban Giám Đốc"
  @ApiOperation({ summary: 'Thành viên Ban Giám Đốc ký hợp đồng bằng mã OTP' })
  @Post(':id/signatures/board')
  @Roles(RoleName.BOARD_MEMBER)
  signBoard(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('email') userEmail: string,
    @Body() body: SignContractWithOtpBodyDto
  ) {
    return this.contractService.signByBoardWithOtp(id, userId, userEmail, body.otpCode)
  }

  // 6. Kiểm tra trạng thái hợp đồng và tiến trình ký kết
  @ApiOperation({ summary: 'Kiểm tra trạng thái hợp đồng và tiến độ ký kết' })
  @Get(':id/status')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  checkStatus(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') role: string) {
    return this.contractService.checkContractStatus(id, userId, role)
  }
}
