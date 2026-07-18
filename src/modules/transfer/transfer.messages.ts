export const TransferMessages = {
  error: {
    noActiveContractFound: 'NO_ACTIVE_CONTRACT_FOUND_FOR_THIS_SERIES',
    transferRequestNotFound: 'TRANSFER_REQUEST_NOT_FOUND',
    invalidStatusForScreening: 'INVALID_STATUS_FOR_SCREENING',
    invalidTransferState: 'Error.InvalidTransferState',
    valuationRequired: 'Error.ValuationRequired',
    onlyAppliesToFullBuyout: 'THIS_ACTION_ONLY_APPLIES_TO_FULL_BUYOUT_CONTRACTS',
    originalContractIdNotFound: 'ORIGINAL_CONTRACT_ID_NOT_FOUND',
    onlyAppliesToRevenueShare: 'THIS_ACTION_ONLY_APPLIES_TO_REVENUE_SHARE_CONTRACTS',
    requestNotInNegotiatingStage: 'REQUEST_IS_NOT_IN_NEGOTIATING_STAGE',
    transferContractNotFound: 'TRANSFER_CONTRACT_NOT_FOUND',
    userOrEmailNotFound: 'USER_OR_EMAIL_NOT_FOUND',
    userHasAlreadySignedContract: 'USER_HAS_ALREADY_SIGNED_THIS_CONTRACT',
    transferContractNotFoundAfterUpdate: 'TRANSFER_CONTRACT_NOT_FOUND_AFTER_UPDATE',
    notTheCoOwnerForChapter: 'YOU_ARE_NOT_THE_CO_OWNER_FOR_THIS_CHAPTER',
    chapterApprovalIsNotPending: 'CHAPTER_APPROVAL_IS_NOT_PENDING'
  },
  response: {
    fullBuyoutProcessed: 'Đã hoàn tất chuyển nhượng mua đứt',
    signatureRecorded: 'Đã ghi nhận chữ ký',
    chapterApproved: 'Đã duyệt chương',
    chapterRejected: 'Đã từ chối chương',
    chapterEscalated: 'Đã chuyển yêu cầu duyệt chương lên Hội đồng',
    noEscalationRequired: 'Không cần chuyển cấp hoặc không tìm thấy bản ghi'
  },
  errorText: {
    NO_ACTIVE_CONTRACT_FOUND_FOR_THIS_SERIES: 'Không tìm thấy hợp đồng đang có hiệu lực cho series này',
    TRANSFER_REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu chuyển nhượng',
    INVALID_STATUS_FOR_SCREENING: 'Yêu cầu chuyển nhượng chưa ở trạng thái phù hợp để sàng lọc',
    'Error.InvalidTransferState': 'Không thể chuyển yêu cầu chuyển nhượng sang trạng thái này',
    'Error.ValuationRequired': 'Cần cung cấp giá trị định giá lớn hơn 0',
    THIS_ACTION_ONLY_APPLIES_TO_FULL_BUYOUT_CONTRACTS: 'Thao tác này chỉ áp dụng cho hợp đồng mua đứt',
    ORIGINAL_CONTRACT_ID_NOT_FOUND: 'Không tìm thấy hợp đồng gốc',
    THIS_ACTION_ONLY_APPLIES_TO_REVENUE_SHARE_CONTRACTS: 'Thao tác này chỉ áp dụng cho hợp đồng chia sẻ doanh thu',
    REQUEST_IS_NOT_IN_NEGOTIATING_STAGE: 'Yêu cầu chuyển nhượng không ở giai đoạn thương lượng',
    TRANSFER_CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng chuyển nhượng',
    USER_OR_EMAIL_NOT_FOUND: 'Không tìm thấy người dùng hoặc email',
    USER_HAS_ALREADY_SIGNED_THIS_CONTRACT: 'Người dùng đã ký hợp đồng chuyển nhượng này',
    TRANSFER_CONTRACT_NOT_FOUND_AFTER_UPDATE: 'Không tìm thấy hợp đồng chuyển nhượng sau khi cập nhật',
    YOU_ARE_NOT_THE_CO_OWNER_FOR_THIS_CHAPTER: 'Bạn không phải đồng sở hữu của chương này',
    CHAPTER_APPROVAL_IS_NOT_PENDING: 'Yêu cầu duyệt chương không ở trạng thái chờ xử lý'
  }
} as const
