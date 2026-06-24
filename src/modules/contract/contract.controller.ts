import { Controller, Get, Post, Body, Param, Patch, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContractService } from './services/contract.service'
import { CreateContractBodyDto, EditorUpdateContractBodyDto } from './dto/contract.dto'
import { ContractStatus } from '@prisma/client'

@ApiTags('contracts')
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get('health')
  health() {
    return this.contractService.healthCheck()
  }

  // 1. Tạo mới tài nguyên hợp đồng (Trạng thái mặc định: DRAFT)
  @Post()
  async createDraft(@Req() req: any, @Body() dto: CreateContractBodyDto) {
    return this.contractService.createDraft(req.user.id, dto)
  }

  // 2. Cập nhật chi tiết các điều khoản hợp đồng
  @Patch(':id')
  async updateContract(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { dto: EditorUpdateContractBodyDto; note?: string }
  ) {
    return this.contractService.editorUpdateContract(id, req.user.id, body.dto, body.note)
  }

  // 3. Cập nhật trạng thái chu trình hợp đồng
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Req() req: any, @Body() body: { status: ContractStatus }) {
    if (body.status === ContractStatus.MANGAKA_REVIEW) {
      return this.contractService.sendToMangaka(id, req.user.id)
    }
    if (body.status === ContractStatus.MANGAKA_APPROVED) {
      return this.contractService.mangakaApprove(id)
    }
  }

  // 4. Tạo tài nguyên "Chữ ký của Mangaka"
  @Post(':id/signatures/mangaka')
  async signMangaka(@Param('id') id: string) {
    return this.contractService.signByMangaka(id)
  }

  // 5. Tạo tài nguyên "Chữ ký của Ban Giám Đốc"
  @Post(':id/signatures/board')
  async signBoard(@Param('id') id: string) {
    return this.contractService.signByBoard(id)
  }
}
