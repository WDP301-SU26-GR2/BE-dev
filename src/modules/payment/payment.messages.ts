// Payment module message catalog.
// Mọi mã theo convention `Error.PascalCase` (AGENTS §7) — chuỗi ném ra CHÍNH LÀ `code` FE phân nhánh.
// Chuẩn hoá 2026-07-20: trước đó nhóm này dùng SCREAMING_SNAKE mô tả dài (vd
// INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED) — vừa lệch convention vừa lộ chi tiết nội bộ ra client.
export const PaymentMessages = {
  error: {
    paymentRecordNotFound: 'Error.PaymentRecordNotFound',
    invalidStatusForApproval: 'Error.PaymentNotApprovable',
    invalidStatusForPayment: 'Error.PaymentNotPayable',
    paymentAlreadyPaid: 'Error.PaymentAlreadyPaid',
    receiverNotFound: 'Error.PaymentReceiverNotFound',
    invalidAmount: 'Error.InvalidPaymentAmount',
    paymentConditionNotFound: 'Error.PaymentConditionNotFound',
    paymentConditionNotEditable: 'Error.PaymentConditionNotEditable',
    // Dùng chung mã với module contract (cùng nghĩa, cùng bản dịch) — registry cho phép trùng khi text khớp.
    contractNotFound: 'Error.ContractNotFound',
    unauthorizedConditionEditor: 'Error.NotAssignedPaymentEditor',
    invalidThresholdConfig: 'Error.InvalidThresholdConfig',
    recurringChapterRequiresRecurring: 'Error.RecurringChapterRequiresRecurring'
  },
  errorText: {
    'Error.PaymentRecordNotFound': 'Không tìm thấy khoản thanh toán',
    'Error.PaymentNotApprovable': 'Chỉ khoản thanh toán đã kích hoạt mới có thể được duyệt',
    'Error.PaymentNotPayable': 'Chỉ khoản thanh toán đã duyệt mới có thể được chi trả',
    'Error.PaymentAlreadyPaid': 'Khoản thanh toán đã được chi trả nên không thể hủy',
    'Error.PaymentReceiverNotFound': 'Không tìm thấy người nhận thanh toán',
    'Error.InvalidPaymentAmount': 'Số tiền phải lớn hơn 0',
    'Error.PaymentConditionNotFound': 'Không tìm thấy điều kiện thanh toán',
    'Error.PaymentConditionNotEditable': 'Điều kiện thanh toán đã hoàn tất hoặc quá hạn nên không thể chỉnh sửa',
    'Error.ContractNotFound': 'Không tìm thấy hợp đồng',
    'Error.NotAssignedPaymentEditor': 'Chỉ Editor phụ trách mới được quản lý điều kiện thanh toán',
    'Error.InvalidThresholdConfig': 'Cấu hình ngưỡng thanh toán không hợp lệ',
    'Error.RecurringChapterRequiresRecurring': 'Điều kiện theo chu kỳ chương phải được đánh dấu là định kỳ'
  }
} as const
