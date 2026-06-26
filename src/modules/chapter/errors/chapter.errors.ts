import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ChapterMessages } from '../chapter.messages'

const E = ChapterMessages.error

export const ChapterNotFoundException = new NotFoundException(E.chapterNotFound)
export const NotSeriesOwnerException = new ForbiddenException(E.notSeriesOwner)
export const NotSeriesEditorException = new ForbiddenException(E.notSeriesEditor)
export const InvalidManuscriptTransitionException = new ConflictException(E.invalidManuscriptTransition)
export const InvalidPageTransitionException = new ConflictException(E.invalidPageTransition)
export const PagesNotAllCompletedException = new ConflictException(E.pagesNotAllCompleted)
export const DuplicateChapterNumberException = new ConflictException(E.duplicateChapterNumber)
export const PageNotFoundException = new NotFoundException(E.pageNotFound)

export const NameNotApprovedException = new UnprocessableEntityException([
  { message: E.nameNotApproved, path: 'nameId' }
])
export const NameNotInSeriesException = new UnprocessableEntityException([
  { message: E.nameNotInSeries, path: 'nameId' }
])

// ĐỊNH NGHĨA SẴN — defer B1, CHƯA throw (// B1-INTEGRATION: bật khi B1 xong).
export const ContractNotExecutedException = new ConflictException(E.contractNotExecuted)
