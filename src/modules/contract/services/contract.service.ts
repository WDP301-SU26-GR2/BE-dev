import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ContractStatus } from '@prisma/client'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { CONTRACT_EVENTS } from '../contract.constant'
import { CreateContractBodyDto, EditorUpdateContractBodyDto } from '../dto/contract.dto'

@Injectable()
export class ContractService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly eventEmitter: EventEmitter2
  ) {}

  // Hàm kiểm tra trạng thái hoạt động của module
  healthCheck() {
    return { status: 'OK', module: 'Contract' }
  }

  // Khởi tạo bản hợp đồng nháp (Editor tạo)
  createDraft(editorId: string, dto: CreateContractBodyDto) {
    return this.contractRepo.createDraft(editorId, dto)
  }

  // Gửi hợp đồng sang cho Mangaka xem xét và thương lượng
  async sendToMangaka(contractId: string, editorId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()

    return this.contractRepo.updateStatus(contractId, ContractStatus.MANGAKA_REVIEW)
  }

  // Editor cập nhật lại điều khoản thương lượng và tự động tăng số hiệu phiên bản (versionNumber)
  async editorUpdateContract(contractId: string, editorId: string, dto: EditorUpdateContractBodyDto, note?: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()

    const nextVersionNumber = contract.versions.length + 1

    const updateData = {
      ...dto,
      status: ContractStatus.NEGOTIATION,
      mangakaSignedAt: null,
      boardSignedAt: null
    }

    return this.contractRepo.updateAndLogVersion(contractId, updateData, editorId, nextVersionNumber, note)
  }

  // Mangaka đồng ý với các điều khoản hiện tại, sẵn sàng chuyển qua bước ký kết
  async mangakaApprove(contractId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()

    return this.contractRepo.updateStatus(contractId, ContractStatus.MANGAKA_APPROVED)
  }

  // Tiến trình ký kết từ phía Mangaka
  async signByMangaka(contractId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaSignedAt) throw ContractErrors.AlreadySigned()

    const updatedData = { mangakaSignedAt: new Date() }

    // SỬA TẠI ĐÂY: Thêm kiểu dữ liệu : ContractStatus để cho phép thay đổi trạng thái tự do
    let nextStatus: ContractStatus = ContractStatus.MANGAKA_SIGNED

    // Nếu Ban giám đốc đã ký trước đó rồi, trạng thái hợp đồng lập tức thành HOÀN THÀNH (FULLY_EXECUTED)
    if (contract.boardSignedAt) {
      nextStatus = ContractStatus.FULLY_EXECUTED
    }

    const result = await this.contractRepo.updateStatus(contractId, nextStatus, updatedData)

    if (nextStatus === ContractStatus.FULLY_EXECUTED) {
      this.eventEmitter.emit(CONTRACT_EVENTS.EXECUTED, result)
    }
    return result
  }

  // Tiến trình ký kết từ phía Ban Giám Đốc (Board)
  async signByBoard(contractId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.boardSignedAt) throw ContractErrors.AlreadySigned()

    const updatedData = { boardSignedAt: new Date() }

    // SỬA TẠI ĐÂY: Thêm kiểu dữ liệu : ContractStatus tương tự
    let nextStatus: ContractStatus = ContractStatus.BOARD_APPROVED

    // Nếu Mangaka đã ký trước đó rồi, trạng thái hợp đồng lập tức thành HOÀN THÀNH (FULLY_EXECUTED)
    if (contract.mangakaSignedAt) {
      nextStatus = ContractStatus.FULLY_EXECUTED
    }

    const result = await this.contractRepo.updateStatus(contractId, nextStatus, updatedData)

    if (nextStatus === ContractStatus.FULLY_EXECUTED) {
      this.eventEmitter.emit(CONTRACT_EVENTS.EXECUTED, result)
    }
    return result
  }
}
