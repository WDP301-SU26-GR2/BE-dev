import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ChapterMessages } from '../chapter.messages'

const E = ChapterMessages.error

export const ChapterNotFoundException = new NotFoundException(E.chapterNotFound)
export const NotSeriesOwnerException = new ForbiddenException(E.notSeriesOwner)
export const NotSeriesEditorException = new ForbiddenException(E.notSeriesEditor)
export const InvalidManuscriptTransitionException = new ConflictException(E.invalidManuscriptTransition)
export const InvalidPageTransitionException = new ConflictException(E.invalidPageTransition)
export const NotCoOwnerException = new ForbiddenException(E.notCoOwner)
export const CoOwnerApprovalNotPendingException = new ConflictException([
  { message: E.coOwnerApprovalNotPending, path: 'id' }
])
export const CoOwnerApprovalNotFoundException = new NotFoundException(E.coOwnerApprovalNotFound)
export const PagesNotAllCompletedException = new ConflictException(E.pagesNotAllCompleted)
export const DuplicateChapterNumberException = new ConflictException(E.duplicateChapterNumber)
export const PageNotFoundException = new NotFoundException(E.pageNotFound)
export const ChapterAccessDeniedException = new ForbiddenException([{ message: E.chapterAccessDenied, path: 'id' }])
export const ChapterNotHoldableException = new ConflictException([{ message: E.chapterNotHoldable, path: 'id' }])
export const ChapterAlreadyOnHoldException = new ConflictException([{ message: E.chapterAlreadyOnHold, path: 'id' }])
export const ChapterNotOnHoldException = new ConflictException([{ message: E.chapterNotOnHold, path: 'id' }])
export const ChapterOnHoldException = new ConflictException([{ message: E.chapterOnHold, path: 'id' }])

export const NameNotApprovedException = new UnprocessableEntityException([
  { message: E.nameNotApproved, path: 'nameId' }
])
export const NameNotInSeriesException = new UnprocessableEntityException([
  { message: E.nameNotInSeries, path: 'nameId' }
])

// A2 (Spec 1): chặn tạo chapter khi series chưa SERIALIZED.
export const SeriesNotSerializedException = new ConflictException(E.seriesNotSerialized)

// A3 (Spec 1): chặn publish khi series chưa có Contract FULLY_EXECUTED (BR-CONTRACT-05).
export const ContractNotExecutedException = new ConflictException(E.contractNotExecuted)
