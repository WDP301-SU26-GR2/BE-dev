// Centralized user-facing messages for the series module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/series.errors.ts`, which references the `error` codes below.
export const SeriesMessages = {
  response: {
    proposalDeleted: 'Đã xoá bản đề xuất',
    seriesReopened: 'Đã mở lại hồ sơ — bạn có thể chỉnh sửa và nộp lại',
    seriesReopenedForReview: 'Đã mở lại vòng chỉnh sửa sau khi hội đồng từ chối'
  },
  // Internal reasons stored on Series.statusHistory (audit trail) are also user-visible activity text.
  reason: {
    forceCancelNoEnding: 'Đã huỷ khi chưa có chương kết — tác giả không thể hoàn thành',
    hiatusHold: 'Bộ truyện tạm ngưng theo yêu cầu của tác giả'
  },
  // In-app notification content (notification layer).
  notification: {
    seriesMetadataUpdated: (fields: string) => `Đã cập nhật thông tin bộ truyện: ${fields}`,
    proposalRevision: (round: number, reason: string) => `Bản đề xuất cần chỉnh sửa (vòng ${round}): ${reason}`,
    proposalResubmitted: (round: number) => `Đã nộp lại bản đề xuất (vòng ${round})`,
    proposalApproved: 'Bản đề xuất đã được duyệt',
    proposalRejected: (reason: string) => `Bản đề xuất bị từ chối: ${reason}`,
    seriesReopenedForReview:
      'Biên tập viên đã mở lại vòng chỉnh sửa sau khi hội đồng từ chối — hãy cập nhật hồ sơ và nộp lại',
    seriesWithdrawnAfterReject: 'Tác giả đã rút bộ truyện sau khi hội đồng từ chối',
    seriesWithdrawnInReview: 'Tác giả đã rút hồ sơ khỏi hàng đợi duyệt',
    seriesCancelling: (allowance: number | null) =>
      allowance != null
        ? `Hội đồng đã quyết định huỷ bộ truyện. Bạn được cấp ${allowance} chương để kết thúc.`
        : 'Hội đồng đã quyết định huỷ bộ truyện.',
    seriesCompleting: 'Hội đồng đã duyệt kết thúc bộ truyện.',
    seriesFormatChanged:
      'Hội đồng đã đổi hình thức xuất bản của bộ truyện. Hạn nộp các chương đang sản xuất giữ nguyên — hãy đặt hạn nộp cho chương kế tiếp theo nhịp mới.',
    seriesContinued: 'Hội đồng quyết định giữ bộ truyện tiếp tục.',
    seriesRejected: 'Hội đồng đã từ chối serial hoá bộ truyện.',
    seriesHiatusStarted: 'Bộ truyện đã tạm ngưng (hiatus).',
    seriesResumed: 'Bộ truyện đã hoạt động trở lại.',
    seriesCancelled: 'Bộ truyện đã chính thức bị huỷ.',
    seriesCompleted: 'Bộ truyện đã chính thức hoàn thành.',
    franchiseConsentRequested: 'Có bộ truyện phái sinh cần bạn đồng ý cho phép thực hiện.',
    franchiseConsentApproved: 'Tác giả gốc đã đồng ý cho bộ truyện phái sinh.',
    franchiseConsentRejected: 'Tác giả gốc đã từ chối bộ truyện phái sinh.',
    // PB-06: Mangaka/Editor proposes natural completion (Series stays SERIALIZED/HIATUS, but
    // `completionProposal` set). Counterparty gets a heads-up so they can raise the question to Board.
    completionProposedToEditor: 'Tác giả đề xuất kết thúc bộ truyện — cần bạn xem xét mở phiên Hội đồng.',
    completionProposedToMangaka: 'Biên tập viên đã ghi nhận đề xuất kết thúc bộ truyện.',
    // PB-06: Series has been HIATUS for > AppConfig.hiatusTooLongDays days — flag for Board triage.
    hiatusTooLong: 'Bộ truyện đang HIATUS quá lâu — cần Hội đồng bàn hướng xử lý.'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/series.errors.ts.
  // Chapter-storyboard error codes live in the storyboard module.
  error: {
    seriesNotFound: 'Error.SeriesNotFound',
    seriesNotEditable: 'Error.SeriesNotEditable',
    seriesMetadataConflict: 'Error.SeriesMetadataConflict',
    notSeriesOwner: 'Error.NotSeriesOwner',
    proposalNotEditable: 'Error.ProposalNotEditable',
    invalidSeriesTransition: 'Error.InvalidSeriesTransition',
    invalidProposalState: 'Error.InvalidProposalState',
    seriesNotReadyToPitch: 'Error.SeriesNotReadyToPitch',
    parentSeriesNotFound: 'Error.ParentSeriesNotFound',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    seriesAlreadyClaimed: 'Error.SeriesAlreadyClaimed',
    reviewAlreadyStarted: 'Error.ReviewAlreadyStarted',
    notAssignedEditor: 'Error.NotAssignedEditor',
    proposalNotDeletable: 'Error.ProposalNotDeletable',
    seriesNotInEndingState: 'Error.SeriesNotInEndingState',
    seriesNotProposableForCompletion: 'Error.SeriesNotProposableForCompletion',
    seriesNotInCancellingState: 'Error.SeriesNotInCancellingState',
    franchiseConsentRequired: 'Error.FranchiseConsentRequired',
    notOriginalMangaka: 'Error.NotOriginalMangaka',
    notFranchiseConsentTarget: 'Error.NotFranchiseConsentTarget',
    seriesRequestRequired: 'Error.SeriesRequestRequired',
    mangakaProfileRequired: 'Error.MangakaProfileRequired'
  },
  errorText: {
    'Error.SeriesNotFound': 'Không tìm thấy bộ truyện',
    'Error.SeriesNotEditable': 'Bộ truyện hiện không thể chỉnh sửa',
    'Error.SeriesMetadataConflict': 'Thông tin bộ truyện đã thay đổi — vui lòng tải lại và thử lại',
    'Error.NotSeriesOwner': 'Bạn không phải chủ sở hữu bộ truyện này',
    'Error.ProposalNotEditable': 'Bản đề xuất hiện không thể chỉnh sửa',
    'Error.InvalidSeriesTransition': 'Không thể chuyển bộ truyện sang trạng thái này',
    'Error.InvalidProposalState': 'Trạng thái bản đề xuất không hợp lệ',
    'Error.SeriesNotReadyToPitch': 'Bộ truyện chưa sẵn sàng để gửi đề xuất',
    'Error.ParentSeriesNotFound': 'Không tìm thấy bộ truyện gốc',
    'Error.SeriesAccessDenied': 'Bạn không có quyền truy cập bộ truyện này',
    'Error.SeriesAlreadyClaimed': 'Bộ truyện này đã có biên tập viên khác nhận',
    'Error.ReviewAlreadyStarted': 'Quá trình duyệt đã bắt đầu',
    'Error.NotAssignedEditor': 'Bạn không phải biên tập viên được phân công cho bộ truyện này',
    'Error.ProposalNotDeletable': 'Bản đề xuất hiện không thể xoá',
    'Error.SeriesNotInEndingState': 'Bộ truyện chưa ở trạng thái kết thúc',
    'Error.SeriesNotProposableForCompletion': 'Bộ truyện hiện không thể đề xuất hoàn thành',
    'Error.SeriesNotInCancellingState': 'Bộ truyện chưa ở trạng thái đang huỷ',
    'Error.FranchiseConsentRequired': 'Cần sự đồng ý của tác giả sở hữu bộ truyện gốc',
    'Error.NotOriginalMangaka': 'Bạn không phải tác giả sở hữu bộ truyện gốc',
    'Error.NotFranchiseConsentTarget': 'Yêu cầu đồng ý này không dành cho bạn',
    'Error.SeriesRequestRequired':
      'Hồ sơ đã sẵn sàng trình Hội đồng — vui lòng gửi yêu cầu rút để biên tập viên xem xét',
    'Error.MangakaProfileRequired': 'Vui lòng hoàn thiện hồ sơ tác giả trước khi nộp để biên tập viên xem xét'
  }
} as const
