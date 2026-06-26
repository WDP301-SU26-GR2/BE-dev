import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const ChapterNotFoundException = new NotFoundException('Error.ChapterNotFound')
export const NotSeriesOwnerException = new ForbiddenException('Error.NotSeriesOwner')
export const NotSeriesEditorException = new ForbiddenException('Error.NotSeriesEditor')
export const InvalidManuscriptTransitionException = new ConflictException('Error.InvalidManuscriptTransition')
export const InvalidPageTransitionException = new ConflictException('Error.InvalidPageTransition')
export const PagesNotAllCompletedException = new ConflictException('Error.PagesNotAllCompleted')
export const DuplicateChapterNumberException = new ConflictException('Error.DuplicateChapterNumber')
export const PageNotFoundException = new NotFoundException('Error.PageNotFound')

export const NameNotApprovedException = new UnprocessableEntityException([
  { message: 'Error.NameNotApproved', path: 'nameId' }
])
export const NameNotInSeriesException = new UnprocessableEntityException([
  { message: 'Error.NameNotInSeries', path: 'nameId' }
])

// ĐỊNH NGHĨA SẴN — defer B1, CHƯA throw (// B1-INTEGRATION: bật khi B1 xong).
export const ContractNotExecutedException = new ConflictException('Error.ContractNotExecuted')
