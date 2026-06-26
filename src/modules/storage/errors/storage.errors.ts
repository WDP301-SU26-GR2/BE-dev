import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { StorageMessages } from '../storage.messages'

const E = StorageMessages.error

export const UnsupportedFileTypeException = new UnprocessableEntityException([
  { message: E.unsupportedFileType, path: 'contentType' }
])

export const FileTooLargeException = new UnprocessableEntityException([
  { message: E.fileTooLarge, path: 'contentLength' }
])

export const AssetNotFoundException = new NotFoundException(E.assetNotFound)

export const DownloadForbiddenException = new ForbiddenException(E.downloadForbidden)
