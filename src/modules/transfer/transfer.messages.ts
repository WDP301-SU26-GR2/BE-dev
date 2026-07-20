// Transfer module message catalog (Flow 8).
// Mọi mã theo convention `Error.PascalCase` (AGENTS §7) — chuỗi ném ra CHÍNH LÀ `code` FE phân nhánh.
// Chuẩn hoá 2026-07-20: trước đó nhóm này dùng SCREAMING_SNAKE dạng câu đầy đủ
// (vd THIS_ACTION_ONLY_APPLIES_TO_FULL_BUYOUT_CONTRACTS) — dài, lệch convention, khó map ở FE.
export const TransferMessages = {
  error: {
    noActiveContractFound: 'Error.NoActiveContractForSeries',
    transferRequestNotFound: 'Error.TransferRequestNotFound',
    invalidStatusForScreening: 'Error.InvalidStatusForScreening',
    invalidTransferState: 'Error.InvalidTransferState',
    valuationRequired: 'Error.ValuationRequired',
    onlyAppliesToFullBuyout: 'Error.OnlyAppliesToFullBuyout',
    originalContractIdNotFound: 'Error.OriginalContractNotFound',
    onlyAppliesToRevenueShare: 'Error.OnlyAppliesToRevenueShare',
    requestNotInNegotiatingStage: 'Error.RequestNotInNegotiatingStage',
    transferContractNotFound: 'Error.TransferContractNotFound',
    userOrEmailNotFound: 'Error.TransferSignerNotFound',
    userHasAlreadySignedContract: 'Error.TransferAlreadySigned',
    transferContractNotFoundAfterUpdate: 'Error.TransferContractNotFoundAfterUpdate',
    // Tên riêng của transfer, KHÔNG trùng `Error.NotCoOwner` của module chapter (khác ngữ cảnh, khác bản dịch).
    notTheCoOwnerForChapter: 'Error.NotChapterCoOwner',
    chapterApprovalIsNotPending: 'Error.ChapterApprovalNotPending'
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
    'Error.NoActiveContractForSeries': 'Không tìm thấy hợp đồng đang có hiệu lực cho series này',
    'Error.TransferRequestNotFound': 'Không tìm thấy yêu cầu chuyển nhượng',
    'Error.InvalidStatusForScreening': 'Yêu cầu chuyển nhượng chưa ở trạng thái phù hợp để sàng lọc',
    'Error.InvalidTransferState': 'Không thể chuyển yêu cầu chuyển nhượng sang trạng thái này',
    'Error.ValuationRequired': 'Cần cung cấp giá trị định giá lớn hơn 0',
    'Error.OnlyAppliesToFullBuyout': 'Thao tác này chỉ áp dụng cho hợp đồng mua đứt',
    'Error.OriginalContractNotFound': 'Không tìm thấy hợp đồng gốc',
    'Error.OnlyAppliesToRevenueShare': 'Thao tác này chỉ áp dụng cho hợp đồng chia sẻ doanh thu',
    'Error.RequestNotInNegotiatingStage': 'Yêu cầu chuyển nhượng không ở giai đoạn thương lượng',
    'Error.TransferContractNotFound': 'Không tìm thấy hợp đồng chuyển nhượng',
    'Error.TransferSignerNotFound': 'Không tìm thấy người dùng hoặc email',
    'Error.TransferAlreadySigned': 'Người dùng đã ký hợp đồng chuyển nhượng này',
    'Error.TransferContractNotFoundAfterUpdate': 'Không tìm thấy hợp đồng chuyển nhượng sau khi cập nhật',
    'Error.NotChapterCoOwner': 'Bạn không phải đồng sở hữu của chương này',
    'Error.ChapterApprovalNotPending': 'Yêu cầu duyệt chương không ở trạng thái chờ xử lý'
  }
} as const
