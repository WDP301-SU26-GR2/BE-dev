// Centralized user-facing messages for the storyboard module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/storyboard.errors.ts`, which references the `error` codes below.
export const StoryboardMessages = {
  // Response message tuỳ biến (FE phân biệt hành động)
  response: {
    storyboardApproved: 'Đã duyệt bản phác thảo — tác giả có thể bắt đầu vẽ bản chính',
    storyboardSubmitted: 'Đã nộp bản phác thảo cho biên tập viên',
    storyboardRevisionRequested: 'Đã gửi yêu cầu chỉnh sửa bản phác thảo',
    chapterStoryboardDeleted: 'Đã xoá bản phác thảo của chương'
  },
  // In-app notification content (notification layer).
  notification: {
    storyboardSubmitted: 'Tác giả đã nộp bản phác thảo chương — mời bạn xem xét.',
    storyboardRevision: (round: number, reason: string) => `Bản phác thảo cần chỉnh sửa (vòng ${round}): ${reason}`,
    storyboardResubmitted: (round: number) => `Tác giả đã nộp lại bản phác thảo (vòng ${round})`,
    storyboardApproved: 'Bản phác thảo của bạn đã được biên tập viên duyệt. Bạn có thể bắt đầu vẽ bản chính.',
    storyboardLoopWarning: (rounds: number) => `Bản phác thảo đã qua ${rounds} vòng chỉnh sửa mà chưa được duyệt`
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/storyboard.errors.ts.
  error: {
    storyboardNotFound: 'Error.StoryboardNotFound',
    invalidStoryboardState: 'Error.InvalidStoryboardState',
    notSeriesOwner: 'Error.NotSeriesOwner',
    notAssignedEditor: 'Error.NotAssignedEditor',
    seriesNotFound: 'Error.SeriesNotFound',
    seriesNotSerialized: 'Error.SeriesNotSerialized',
    duplicateChapterStoryboard: 'Error.DuplicateChapterStoryboard',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    chapterNotFound: 'Error.ChapterNotFound',
    chapterNotDraftForStoryboard: 'Error.ChapterNotDraftForStoryboard',
    chapterStoryboardAlreadyExists: 'Error.ChapterStoryboardAlreadyExists',
    storyboardNotDeletable: 'Error.StoryboardNotDeletable'
  },
  errorText: {
    'Error.StoryboardNotFound': 'Không tìm thấy bản phác thảo',
    'Error.InvalidStoryboardState': 'Bản phác thảo đang ở trạng thái không cho phép thao tác này',
    'Error.NotSeriesOwner': 'Bạn không phải chủ sở hữu bộ truyện này',
    'Error.NotAssignedEditor': 'Bạn không phải biên tập viên được phân công cho bộ truyện này',
    'Error.SeriesNotFound': 'Không tìm thấy bộ truyện',
    'Error.SeriesNotSerialized': 'Bộ truyện chưa được duyệt để phát hành dài kỳ',
    'Error.DuplicateChapterStoryboard': 'Chương này đã có bản phác thảo',
    'Error.SeriesAccessDenied': 'Bạn không có quyền truy cập bộ truyện này',
    'Error.ChapterNotFound': 'Không tìm thấy chương',
    'Error.ChapterNotDraftForStoryboard': 'Chương không còn ở giai đoạn tạo bản phác thảo',
    'Error.ChapterStoryboardAlreadyExists': 'Chương này đã có bản phác thảo',
    'Error.StoryboardNotDeletable': 'Không thể xoá bản phác thảo ở trạng thái hiện tại'
  }
} as const
