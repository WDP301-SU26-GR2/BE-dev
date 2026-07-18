export const PaymentMessages = {
  error: {
    paymentRecordNotFound: 'PAYMENT_RECORD_NOT_FOUND',
    invalidStatusForApproval: 'INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED',
    invalidStatusForPayment: 'INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED',
    paymentAlreadyPaid: 'PAYMENT_ALREADY_PAID_CANNOT_CANCEL',
    receiverNotFound: 'RECEIVER_USER_NOT_FOUND',
    invalidAmount: 'INVALID_AMOUNT_MUST_BE_GREATER_THAN_0',
    paymentConditionNotFound: 'PAYMENT_CONDITION_NOT_FOUND',
    paymentConditionNotEditable: 'PAYMENT_CONDITION_NOT_EDITABLE_STATUS_ACHIEVED_OR_MISSED',
    contractNotFound: 'CONTRACT_NOT_FOUND',
    unauthorizedConditionEditor: 'ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS',
    invalidThresholdConfig: 'INVALID_THRESHOLD_CONFIG',
    recurringChapterRequiresRecurring: 'RECURRING_CHAPTER_REQUIRES_IS_RECURRING_TRUE'
  },
  errorText: {
    PAYMENT_RECORD_NOT_FOUND: 'Không tìm thấy khoản thanh toán',
    INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED: 'Chỉ khoản thanh toán đã kích hoạt mới có thể được duyệt',
    INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED: 'Chỉ khoản thanh toán đã duyệt mới có thể được chi trả',
    PAYMENT_ALREADY_PAID_CANNOT_CANCEL: 'Khoản thanh toán đã được chi trả nên không thể hủy',
    RECEIVER_USER_NOT_FOUND: 'Không tìm thấy người nhận thanh toán',
    INVALID_AMOUNT_MUST_BE_GREATER_THAN_0: 'Số tiền phải lớn hơn 0',
    PAYMENT_CONDITION_NOT_FOUND: 'Không tìm thấy điều kiện thanh toán',
    PAYMENT_CONDITION_NOT_EDITABLE_STATUS_ACHIEVED_OR_MISSED:
      'Điều kiện thanh toán đã hoàn tất hoặc quá hạn nên không thể chỉnh sửa',
    CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng',
    ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS: 'Chỉ Editor phụ trách mới được quản lý điều kiện thanh toán',
    INVALID_THRESHOLD_CONFIG: 'Cấu hình ngưỡng thanh toán không hợp lệ',
    RECURRING_CHAPTER_REQUIRES_IS_RECURRING_TRUE: 'Điều kiện theo chu kỳ chương phải được đánh dấu là định kỳ'
  }
} as const
