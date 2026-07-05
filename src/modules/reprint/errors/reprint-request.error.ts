import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'

export const ReprintRequestErrors = {
  NotFound: () => new NotFoundException('REPRINT_REQUEST_NOT_FOUND'),

  ContractNotFound: () => new NotFoundException('ACTIVE_CONTRACT_NOT_FOUND_FOR_SERIES'),

  OriginalChaptersNotFound: () => new NotFoundException('ORIGINAL_CHAPTERS_NOT_FOUND_IN_RANGE'),

  ChapterNotFound: () => new NotFoundException('REPRINT_CHAPTER_NOT_FOUND'),

  InvalidStatus: () => new BadRequestException('INVALID_REPRINT_REQUEST_STATUS'),

  ActionNotAllowed: () => new ForbiddenException('ACTION_NOT_ALLOWED_FOR_THIS_OWNERSHIP')
}
