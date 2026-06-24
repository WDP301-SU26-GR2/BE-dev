import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const UnsupportedFileTypeException = new UnprocessableEntityException([
  { message: 'Error.UnsupportedFileType', path: 'contentType' }
])

export const FileTooLargeException = new UnprocessableEntityException([
  { message: 'Error.FileTooLarge', path: 'contentLength' }
])

export const AssetNotFoundException = new NotFoundException('Error.AssetNotFound')

export const DownloadForbiddenException = new ForbiddenException('Error.DownloadForbidden')
