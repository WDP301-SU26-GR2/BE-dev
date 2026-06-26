import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ContractService } from './services/contract.service'
import { CreateContractBodyDto, EditorUpdateContractBodyDto, SignContractWithOtpBodyDto } from './dto/contract.dto'
import { ContractStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator' // Đường dẫn import tùy thuộc dự án của bạn
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator' // Đường dẫn import tùy thuộc dự án của bạn

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get('health')
  health() {
    return this.contractService.healthCheck()
  }

  // 1. Tạo mới tài nguyên hợp đồng nháp
  @Post()
  @Roles(RoleName.EDITOR)
  createDraft(@ActiveUser('userId') userId: string, @Body() dto: CreateContractBodyDto) {
    return this.contractService.createDraft(userId, dto)
  }

  // 2. Cập nhật chi tiết các điều khoản thương lượng hợp đồng
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
  @Get(':id/status')
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  checkStatus(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') role: string) {
    return this.contractService.checkContractStatus(id, userId, role)
  }
}
