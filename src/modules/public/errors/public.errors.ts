import { NotFoundException } from '@nestjs/common'
import { PublicMessages } from '../public.messages'

const E = PublicMessages.error

// The same 404 intentionally covers malformed/missing/private resources so guests cannot probe internal state.
export const PublicSeriesNotFoundException = new NotFoundException(E.seriesNotFound)
export const PublicChapterNotFoundException = new NotFoundException(E.chapterNotFound)
