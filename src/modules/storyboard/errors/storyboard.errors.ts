import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { StoryboardMessages } from '../storyboard.messages'

const E = StoryboardMessages.error

export const StoryboardNotFoundException = new NotFoundException(E.storyboardNotFound)
export const InvalidStoryboardStateException = new ConflictException([
  { message: E.invalidStoryboardState, path: 'status' }
])
export const NotSeriesOwnerException = new ForbiddenException(E.notSeriesOwner)
export const NotAssignedEditorException = new ForbiddenException(E.notAssignedEditor)
export const SeriesNotFoundException = new NotFoundException(E.seriesNotFound)
export const SeriesNotSerializedException = new ConflictException([{ message: E.seriesNotSerialized, path: 'status' }])
export const DuplicateChapterStoryboardException = new ConflictException([
  { message: E.duplicateChapterStoryboard, path: 'chapterId' }
])
export const SeriesAccessDeniedException = new ForbiddenException(E.seriesAccessDenied)
export const ChapterNotFoundException = new NotFoundException([{ message: E.chapterNotFound, path: 'id' }])
export const ChapterNotDraftForStoryboardException = new ConflictException([
  { message: E.chapterNotDraftForStoryboard, path: 'status' }
])
export const ChapterStoryboardAlreadyExistsException = new ConflictException([
  { message: E.chapterStoryboardAlreadyExists, path: 'id' }
])
export const StoryboardNotDeletableException = new ConflictException([
  { message: E.storyboardNotDeletable, path: 'status' }
])
