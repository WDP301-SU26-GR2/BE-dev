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
  }
} as const
