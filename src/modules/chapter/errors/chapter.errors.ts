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
  { message: E.coOwnerApprovalNotPending, path: 'status' }
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
export const NameNotChapterKindException = new UnprocessableEntityException([
  { message: E.nameNotChapterKind, path: 'nameId' }
])

// A2 (Spec 1): chặn tạo chapter khi series chưa SERIALIZED.
export const SeriesNotSerializedException = new ConflictException(E.seriesNotSerialized)

// A3 (Spec 1): chặn publish khi series chưa có Contract FULLY_EXECUTED (BR-CONTRACT-05).
export const ContractNotExecutedException = new ConflictException(E.contractNotExecuted)

// Task 3 (Spec 10): chặn upload page khi Name chưa APPROVED.
export const ChapterNameNotApprovedException = new ConflictException([
  { message: E.chapterNameNotApproved, path: 'nameId' }
])

// Task 4 (Spec 10): chặn sửa title khi PUBLISHED.
export const ChapterNotEditableException = new ConflictException([{ message: E.chapterNotEditable, path: 'status' }])

// Task 4 (Spec 10): chặn đổi chapterNumber khi không phải DRAFT.
export const ChapterNumberLockedException = new ConflictException([
  { message: E.chapterNumberLocked, path: 'chapterNumber' }
])

// Task 5 (Spec 10): chặn xóa chapter không phải DRAFT.
export const ChapterNotDeletableException = new ConflictException([{ message: E.chapterNotDeletable, path: 'status' }])

// Fix-1 (G-1): series CANCELLING đã đạt trần số chương kết thúc Board cấp.
export const EndingAllowanceExceededException = new ConflictException([
  { message: E.endingAllowanceExceeded, path: 'seriesId' }
])
