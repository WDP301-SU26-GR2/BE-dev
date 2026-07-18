// Centralized user-facing message codes for the studio module — single source of truth.
// Plain strings only (no NestJS imports). HTTP status + path live in errors/studio.errors.ts.
export const StudioMessages = {
  notification: {
    inviteReceived: 'Bạn nhận được lời mời cộng tác',
    inviteAccepted: 'Lời mời cộng tác của bạn đã được chấp nhận',
    inviteDeclined: 'Lời mời cộng tác của bạn đã bị từ chối',
    assignmentTerminated: 'Một hợp tác studio đã kết thúc'
  },
  error: {
    inviteNotFound: 'Error.InviteNotFound',
    inviteNotPending: 'Error.InviteNotPending',
    notInvitee: 'Error.NotInvitee',
    notInviteOwner: 'Error.NotInviteOwner',
    duplicateActiveCollaboration: 'Error.DuplicateActiveCollaboration',
    assistantNotFound: 'Error.AssistantNotFound',
    targetNotAssistant: 'Error.TargetNotAssistant',
    assignmentNotFound: 'Error.AssignmentNotFound',
    assignmentNotActive: 'Error.AssignmentNotActive',
    notAssignmentOwner: 'Error.NotAssignmentOwner',
    invalidHirePeriod: 'Error.InvalidHirePeriod'
  },
  errorText: {
    'Error.InviteNotFound': 'Không tìm thấy lời mời cộng tác',
    'Error.InviteNotPending': 'Lời mời này không còn chờ phản hồi',
    'Error.NotInvitee': 'Lời mời này không dành cho bạn',
    'Error.NotInviteOwner': 'Bạn không phải người tạo lời mời này',
    'Error.DuplicateActiveCollaboration': 'Hai bên đã có hợp tác đang hiệu lực',
    'Error.AssistantNotFound': 'Không tìm thấy trợ lý',
    'Error.TargetNotAssistant': 'Người dùng được chọn không phải trợ lý',
    'Error.AssignmentNotFound': 'Không tìm thấy hợp tác studio',
    'Error.AssignmentNotActive': 'Hợp tác studio không còn hiệu lực',
    'Error.NotAssignmentOwner': 'Bạn không có quyền quản lý hợp tác này',
    'Error.InvalidHirePeriod': 'Thời gian hợp tác không hợp lệ'
  }
} as const
