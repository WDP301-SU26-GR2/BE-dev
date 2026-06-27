import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ContractStatus } from '@prisma/client'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { CONTRACT_EVENTS } from '../contract.constant'
import { CreateContractBodyDto, EditorUpdateContractBodyDto } from '../dto/contract.dto'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'

@Injectable()
export class ContractService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly authOtpService: AuthOtpService,
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
  async signByMangakaWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaSignedAt) throw ContractErrors.AlreadySigned()

    // LỚP 1: Kiểm tra xem tài khoản đang đăng nhập có đúng là Mangaka được chỉ định trong hợp đồng này không
    if (contract.mangakaId !== loggedInUserId) {
      throw ContractErrors.UnauthorizedEditor()
    }

    // LỚP 2: Gọi AuthOtpService đối chiếu mã OTP dựa trên Email của người dùng đang đăng nhập
    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT' // Đồng bộ chung một loại purpose với phía Board
    })

    // LỚP 3: Mọi thứ hợp lệ -> Tiến hành ký kết
    const updatedData = { mangakaSignedAt: new Date() }
    let nextStatus: ContractStatus = ContractStatus.MANGAKA_SIGNED

    if (contract.boardSignedAt) {
      nextStatus = ContractStatus.FULLY_EXECUTED
    }

    const result = await this.contractRepo.updateStatus(contractId, nextStatus, updatedData)

    if (nextStatus === ContractStatus.FULLY_EXECUTED) {
      this.eventEmitter.emit(CONTRACT_EVENTS.EXECUTED, result)
    }
    return result
  }

  // Tiến trình ký kết đồng thuận từ phía Ban Giám Đốc (Board) - Quan hệ 1-N tối ưu
  async signByBoardWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    // 1. Gọi Repo lấy hợp đồng và thông tin Quyết định (đã lược bỏ khuyết allowedEditors)
    const contract = await this.contractRepo.findWithBoardDecision(contractId)

    if (!contract) throw ContractErrors.NotFound()
    if (contract.boardSignedAt) throw ContractErrors.AlreadySigned()
    if (!contract.boardDecision) throw ContractErrors.BoardDecisionNotFound()

    // 2. [BẢO MẬT] Kiểm tra ID sếp bằng hàm .includes() trực tiếp trên mảng chuỗi ID nguyên thủy của MongoDB
    const isAllowed = contract.boardDecision.allowedEditorIds.includes(loggedInUserId)
    if (!isAllowed) throw ContractErrors.NotAuthorizedInBoard()

    // 3. Gọi Repo kiểm tra sếp này đã ký vào bản hợp đồng này trước đó chưa
    const alreadySigned = await this.contractRepo.findSpecificSignature(contractId, loggedInUserId)
    if (alreadySigned) throw ContractErrors.BoardMemberAlreadySigned()

    // 4. [XÁC THỰC OTP] Đối chiếu mã OTP
    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT'
    })

    // 5. [TÍNH TOÁN ĐỒNG THUẬN]
    // Lấy tổng số lượng sếp bắt buộc phải ký từ độ dài mảng ID
    const totalRequiredSigns = contract.boardDecision.allowedEditorIds.length

    // Gọi Repo đếm số chữ ký thực tế hiện tại có trong DB
    const currentActualSigns = await this.contractRepo.countBoardSignatures(contractId)
    const newTotalSigns = currentActualSigns + 1

    const shouldFinalizeBoard = newTotalSigns === totalRequiredSigns
    let result

    if (shouldFinalizeBoard) {
      const updatedData = { boardSignedAt: new Date() }
      let nextStatus: ContractStatus = ContractStatus.BOARD_APPROVED

      if (contract.mangakaSignedAt) {
        nextStatus = ContractStatus.FULLY_EXECUTED
      }

      // Gọi Repo thực thi lưu chữ ký cuối cùng và cập nhật trạng thái hợp đồng chính
      result = await this.contractRepo.executeBoardSignature(contractId, loggedInUserId, true, nextStatus, updatedData)

      if (nextStatus === ContractStatus.FULLY_EXECUTED) {
        this.eventEmitter.emit(CONTRACT_EVENTS.EXECUTED, result)
      }

      return {
        status: 'COMPLETED',
        message: 'Toàn bộ thành viên Hội đồng Ban giám đốc đã ký kết thành công!',
        contract: result
      }
    } else {
      // Gọi Repo lưu vết chữ ký riêng lẻ (chưa chốt hợp đồng)
      result = await this.contractRepo.executeBoardSignature(contractId, loggedInUserId, false)

      return {
        status: 'PENDING_MORE_SIGNATURES',
        message: `Ghi nhận chữ ký thành công. Đang chờ các thành viên khác trong Hội đồng ký kết (${newTotalSigns}/${totalRequiredSigns})`,
        contract: result
      }
    }
  }

  async checkContractStatus(contractId: string, currentUserId: string, currentUserRole: string) {
    const contract = await this.contractRepo.getContractSignaturesProgress(contractId)
    if (!contract) {
      throw ContractErrors.NotFound()
    }

    // Chặn Mangaka xem trộm hợp đồng của người khác
    if (currentUserRole === 'MANGAKA' && contract.mangakaId !== currentUserId) {
      throw ContractErrors.UnauthorizedEditor()
    }

    // Kiểm tra quyết định hội đồng đi kèm
    if (!contract.boardDecision) {
      throw ContractErrors.BoardDecisionNotFound()
    }

    const allowedEditorIds = contract.boardDecision.allowedEditorIds || []

    // Chặn BOARD_EDITOR xem trộm tiến độ nếu không thuộc hội đồng được chỉ định
    if (currentUserRole === 'BOARD_EDITOR' && !allowedEditorIds.includes(currentUserId)) {
      throw ContractErrors.NotAuthorizedInBoard()
    }

    // Khớp chính xác với tên trường mảng từ repo trả ra
    const signedSignatures = contract.contractSignatures || []

    const boardSignatures = {
      signedEditors: [] as Array<{ id: string; actionAt: Date }>,
      pendingEditors: [] as Array<{ id: string; actionAt: null }>
    }

    // Phân loại tiến độ ký duyệt của các sếp
    allowedEditorIds.forEach((managerId) => {
      const signatureLog = signedSignatures.find((sig) => sig.userId === managerId)

      if (signatureLog) {
        boardSignatures.signedEditors.push({
          id: managerId,
          actionAt: signatureLog.signedAt
        })
      } else {
        boardSignatures.pendingEditors.push({
          id: managerId,
          actionAt: null
        })
      }
    })

    return {
      success: true,
      data: {
        id: contract.id,
        status: contract.status,
        mangaka: {
          id: contract.mangakaId,
          isSigned: !!contract.mangakaSignedAt,
          signedAt: contract.mangakaSignedAt
        },
        boardProgress: {
          totalRequired: allowedEditorIds.length,
          totalSigned: boardSignatures.signedEditors.length,
          signedEditors: boardSignatures.signedEditors,
          pendingEditors: boardSignatures.pendingEditors
        }
      }
    }
  }
}
