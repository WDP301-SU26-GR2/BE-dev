// Centralized user-facing message codes for the task module — single source of truth.
// Plain strings only (no NestJS imports). HTTP status + path live in errors/task.errors.ts.
export const TaskMessages = {
  notification: {
    taskAssigned: 'Bạn được giao một công việc mới',
    taskSubmittedForReview: (version: number) => `Có công việc được gửi để bạn duyệt (phiên bản ${version})`,
    taskRevisionRequested: (round: number, note: string) => `Công việc của bạn cần chỉnh sửa (vòng ${round}): ${note}`,
    taskApproved: 'Công việc của bạn đã được duyệt',
    taskCancelled: 'Công việc của bạn đã bị huỷ',
    taskReassigned: 'Công việc đã được giao lại cho trợ lý khác'
  },
  // Ghi vào `Task.statusReason` — field NÀY CÓ trong TaskRes nên hiển thị thẳng cho Assistant/Mangaka.
  // Phải là tiếng Việt như mọi text user-facing khác (Spec 21). Record cũ đã lưu chuỗi tiếng Anh
  // thì giữ nguyên (không migrate) — chấp nhận lệch lịch sử.
  reason: {
    regionDeleted: 'Vùng được giao đã bị xoá',
    cancelledByMangaka: 'Mangaka đã huỷ công việc này',
    reassigned: 'Công việc đã được chuyển cho trợ lý khác'
  },
  error: {
    pageNotFound: 'Error.PageNotFound',
    regionNotFound: 'Error.RegionNotFound',
    taskNotFound: 'Error.TaskNotFound',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notTaskAssignee: 'Error.NotTaskAssignee',
    assistantNotHired: 'Error.AssistantNotHired',
    assetNotFound: 'Error.AssetNotFound',
    taskNotReassignable: 'Error.TaskNotReassignable',
    taskNotCancellable: 'Error.TaskNotCancellable',
    regionHasApprovedTasks: 'Error.RegionHasApprovedTasks',
    chapterOnHold: 'Error.ChapterOnHold',
    pageNotEditable: 'Error.PageNotEditable',
    invalidTaskTransition: 'Error.InvalidTaskTransition',
    taskFileForbidden: 'Error.TaskFileForbidden'
  },
  errorText: {
    'Error.PageNotFound': 'Không tìm thấy trang',
    'Error.RegionNotFound': 'Không tìm thấy vùng làm việc',
    'Error.TaskNotFound': 'Không tìm thấy công việc',
    'Error.NotSeriesOwner': 'Bạn không phải chủ sở hữu series này',
    'Error.NotTaskAssignee': 'Bạn không phải người được giao công việc này',
    'Error.AssistantNotHired': 'Trợ lý chưa có hợp tác hiệu lực với Mangaka',
    'Error.AssetNotFound': 'Không tìm thấy tệp tài nguyên',
    'Error.TaskNotReassignable': 'Công việc hiện không thể giao lại',
    'Error.TaskNotCancellable': 'Công việc hiện không thể huỷ',
    'Error.RegionHasApprovedTasks': 'Vùng này có công việc đã được duyệt nên không thể xoá',
    'Error.ChapterOnHold': 'Chương đang tạm dừng sản xuất',
    'Error.PageNotEditable': 'Trang đang được Editor duyệt, không thể chỉnh sửa',
    'Error.InvalidTaskTransition': 'Không thể chuyển công việc sang trạng thái này',
    'Error.TaskFileForbidden': 'Bạn không có quyền tải tệp của công việc này'
  }
} as const
