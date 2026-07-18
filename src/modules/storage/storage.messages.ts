// Centralized user-facing messages for the storage module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/storage.errors.ts`, which references the `error` codes below.
export const StorageMessages = {
  // Error codes (FE maps these keys to localized text). Consumed by errors/storage.errors.ts.
  error: {
    unsupportedFileType: 'Error.UnsupportedFileType',
    fileTooLarge: 'Error.FileTooLarge',
    assetNotFound: 'Error.AssetNotFound',
    downloadForbidden: 'Error.DownloadForbidden'
  },
  errorText: {
    'Error.UnsupportedFileType': 'Định dạng tệp không được hỗ trợ',
    'Error.FileTooLarge': 'Tệp vượt quá dung lượng cho phép',
    'Error.AssetNotFound': 'Không tìm thấy tệp tài nguyên',
    'Error.DownloadForbidden': 'Bạn không có quyền tải tệp này'
  }
} as const
