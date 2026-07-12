import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { NameMessages } from '../name.messages'

const E = NameMessages.error

export const NameNotFoundException = new NotFoundException(E.nameNotFound)
export const InvalidNameStateException = new ConflictException([{ message: E.invalidNameState, path: 'status' }])
export const NotSeriesOwnerException = new ForbiddenException(E.notSeriesOwner)
export const NotAssignedEditorException = new ForbiddenException(E.notAssignedEditor)
export const SeriesNotFoundException = new NotFoundException(E.seriesNotFound)
export const SeriesNotSerializedException = new ConflictException([{ message: E.seriesNotSerialized, path: 'status' }])
export const DuplicateChapterNameException = new ConflictException([
  { message: E.duplicateChapterName, path: 'chapterNumber' }
])
export const SeriesAccessDeniedException = new ForbiddenException(E.seriesAccessDenied)
export const ChapterNotFoundException = new NotFoundException([{ message: E.chapterNotFound, path: 'id' }])
export const ChapterNotDraftForNameException = new ConflictException([
  { message: E.chapterNotDraftForName, path: 'status' }
])
export const ChapterNameAlreadyExistsException = new ConflictException([
  { message: E.chapterNameAlreadyExists, path: 'id' }
])
export const NameNotDeletableException = new ConflictException([{ message: E.nameNotDeletable, path: 'status' }])
