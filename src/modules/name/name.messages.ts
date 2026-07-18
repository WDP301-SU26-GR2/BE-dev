// Centralized user-facing messages for the name module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/name.errors.ts`, which references the `error` codes below.
export const NameMessages = {
  response: {
    chapterNameDeleted: 'Đã xoá name của chương'
  },
  // In-app notification content (notification layer).
  notification: {
    nameRevision: (round: number, reason: string) => `Name cần chỉnh sửa (vòng ${round}): ${reason}`,
    nameResubmitted: (round: number) => `Đã nộp lại name (vòng ${round})`,
    nameApproved: 'Name đã được duyệt',
    nameLoopWarning: (rounds: number) => `Quá trình duyệt name đã đạt ${rounds} vòng`
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/name.errors.ts.
  error: {
    nameNotFound: 'Error.NameNotFound',
    invalidNameState: 'Error.InvalidNameState',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notAssignedEditor: 'Error.NotAssignedEditor',
    seriesNotFound: 'Error.SeriesNotFound',
    seriesNotSerialized: 'Error.SeriesNotSerialized',
    duplicateChapterName: 'Error.DuplicateChapterName',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    chapterNotFound: 'Error.ChapterNotFound',
    chapterNotDraftForName: 'Error.ChapterNotDraftForName',
    chapterNameAlreadyExists: 'Error.ChapterNameAlreadyExists',
    nameNotDeletable: 'Error.NameNotDeletable'
  },
  errorText: {
    'Error.NameNotFound': 'Không tìm thấy name',
    'Error.InvalidNameState': 'Trạng thái name không hợp lệ',
    'Error.NotSeriesOwner': 'Bạn không phải chủ sở hữu series này',
    'Error.NotAssignedEditor': 'Bạn không phải Editor được phân công cho series này',
    'Error.SeriesNotFound': 'Không tìm thấy series',
    'Error.SeriesNotSerialized': 'Series chưa được duyệt để phát hành dài kỳ',
    'Error.DuplicateChapterName': 'Số chương này đã có name',
    'Error.SeriesAccessDenied': 'Bạn không có quyền truy cập series này',
    'Error.ChapterNotFound': 'Không tìm thấy chương',
    'Error.ChapterNotDraftForName': 'Chương hiện không ở trạng thái tạo name',
    'Error.ChapterNameAlreadyExists': 'Chương này đã có name',
    'Error.NameNotDeletable': 'Name hiện không thể xoá'
  }
} as const
