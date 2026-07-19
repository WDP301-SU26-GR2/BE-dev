import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { ContractMessages } from '../contract.messages'

const E = ContractMessages.error

export const ContractErrors = {
  // Lỗi khi tìm kiếm một hợp đồng không tồn tại trong DB
  NotFound: () => new NotFoundException('CONTRACT_NOT_FOUND'),

  // B-CON-01: chỉ được tạo hợp đồng sau khi series đã được Board serial hoá (SERIALIZED)
  SeriesNotSerialized: () => new ConflictException([{ message: 'Error.SeriesNotSerialized', path: 'seriesId' }]),

  // B-CON-07: route revenue chỉ áp dụng cho hợp đồng REVENUE_SHARE đã FULLY_EXECUTED
  RevenueNotApplicable: () => new ConflictException('REVENUE_NOT_APPLICABLE'),

  // Lỗi khi Editor này cố tình sửa hợp đồng của Editor khác phụ trách
  UnauthorizedEditor: () => new ForbiddenException('ONLY_ASSIGNED_EDITOR_CAN_EDIT'),

  // Sai Mangaka của hợp đồng (approve / request-changes / ký OTP / xem tiến độ ký) — chuẩn Error.PascalCase.
  // Trước 2026-07-17 các path này ném nhầm UnauthorizedEditor (lệch ngữ nghĩa) — đã tách.
  NotContractMangaka: () => new ForbiddenException([{ message: E.notContractMangaka, path: 'mangakaId' }]),

  // Ngoài phạm vi xem hợp đồng này (Mangaka khác / Editor khác phụ trách) — mirror Error.SeriesAccessDenied.
  ContractAccessDenied: () => new ForbiddenException([{ message: E.contractAccessDenied, path: 'id' }]),

  // Lỗi khi trạng thái hợp đồng không hợp lệ cho hành động hiện tại (ví dụ: đang DRAFT mà đòi ký)
  InvalidStatus: () => new BadRequestException('INVALID_CONTRACT_STATUS_FOR_THIS_ACTION'),

  // B-CON-02: chuyển trạng thái không hợp lệ theo CONTRACT_TRANSITIONS (Requiment Flow 6)
  InvalidContractTransition: () => new ConflictException([{ message: E.invalidContractTransition, path: 'status' }]),

  // B-CON-02: chưa BOARD_APPROVED thì chưa được ký
  NotSignableYet: () => new ConflictException([{ message: E.contractNotSignableYet, path: 'status' }]),

  AlreadySigned: () => new BadRequestException('CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY'),

  BoardDecisionNotFound: () =>
    new BadRequestException(
      'BOARD_DECISION_NOT_FOUND',
      'Hợp đồng này chưa có quyết định phê duyệt chính thức từ Hội đồng'
    ),

  ContractCreationBoardDecisionNotFound: () =>
    new NotFoundException([{ message: E.boardDecisionNotFound, path: 'boardDecisionId' }]),

  InvalidSerializationDecision: () =>
    new ConflictException([{ message: E.invalidSerializationDecision, path: 'boardDecisionId' }]),

  ContractMangakaMismatch: () => new ConflictException([{ message: E.contractMangakaMismatch, path: 'mangakaId' }]),

  OpenContractExists: () => new ConflictException([{ message: E.openContractExists, path: 'seriesId' }]),

  NotAuthorizedInBoard: () =>
    new ForbiddenException(
      'NOT_AUTHORIZED_IN_BOARD',
      'Tài khoản của bạn không thuộc Hội đồng Ban giám đốc được chỉ định ký kết hợp đồng này'
    ),

  BoardMemberAlreadySigned: () =>
    new BadRequestException(
      'BOARD_MEMBER_ALREADY_SIGNED',
      'Bạn đã thực hiện xác thực ký vào hợp đồng này trước đó rồi'
    ),

  // --- Spec 4: ContractAmendment errors (chuẩn BE-A Error.PascalCase) ---

  // Chỉ hợp đồng FULLY_EXECUTED mới được tạo phụ lục (BR-CONTRACT-01)
  ContractNotAmendable: () => new ConflictException([{ message: 'Error.ContractNotAmendable', path: 'contractId' }]),

  // Đã có 1 phụ lục chưa kết thúc (DRAFT/PENDING_SIGNATURES) trên hợp đồng này
  OpenAmendmentExists: () => new ConflictException([{ message: 'Error.OpenAmendmentExists', path: 'contractId' }]),

  AmendmentNotFound: () => new NotFoundException([{ message: 'Error.AmendmentNotFound', path: 'id' }]),

  // Chỉ sửa được khi DRAFT
  AmendmentNotEditable: () => new ConflictException([{ message: 'Error.AmendmentNotEditable', path: 'status' }]),

  // Chỉ submit được khi DRAFT
  AmendmentNotSubmittable: () => new ConflictException([{ message: 'Error.AmendmentNotSubmittable', path: 'status' }]),

  // Submit nhưng không có field term nào thay đổi
  AmendmentNoChanges: () =>
    new UnprocessableEntityException([{ message: 'Error.AmendmentNoChanges', path: 'changedClauses' }]),

  // Ký/reject nhưng phụ lục không ở PENDING_SIGNATURES
  AmendmentNotPendingSignatures: () =>
    new ConflictException([{ message: 'Error.AmendmentNotPendingSignatures', path: 'status' }]),

  // FULL_BUYOUT: Mangaka không cần ký (Board toàn quyền — BR-CONTRACT-03)
  MangakaSignNotRequired: () => new ConflictException('MangakaSignNotRequired'),

  // Void nhưng phụ lục đã terminal (FULLY_EXECUTED/VOIDED)
  AmendmentNotVoidable: () => new ConflictException([{ message: 'Error.AmendmentNotVoidable', path: 'status' }]),

  // Amendment đổi FULL_BUYOUT sang tỉ lệ share (không cho — phải làm HĐ mới)
  OwnershipMismatch: () =>
    new UnprocessableEntityException([{ message: 'Error.OwnershipMismatch', path: 'mangakaOwnershipPct' }])
}
