import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ReprintRequestMessages } from '../reprint-request.messages'

const E = ReprintRequestMessages.error

export const ReprintRequestErrors = {
  // B-RPT-01: ReprintRequest không tồn tại (hoặc id không phải ObjectId hợp lệ — guard uniform 404).
  NotFound: () => new NotFoundException([{ message: E.reprintRequestNotFound, path: 'id' }]),

  // B-RPT-01: Series không có hợp đồng FULLY_EXECUTED để xác định Ownership.
  ContractNotFound: () => new NotFoundException([{ message: E.activeContractNotFound, path: 'seriesId' }]),

  // B-RPT-01: Không có chapter PUBLISHED nào trong khoảng yêu cầu.
  OriginalChaptersNotFound: () =>
    new NotFoundException([{ message: E.originalChaptersNotFound, path: 'chapterRange' }]),

  // Embedded chapter không tồn tại trong yêu cầu tái bản này.
  ChapterNotFound: () => new NotFoundException([{ message: E.reprintChapterNotFound, path: 'chapterId' }]),

  // B-RPT-02: Transition trạng thái không hợp lệ theo REPRINT_REQUEST_TRANSITIONS.
  InvalidReprintTransition: () => new ConflictException([{ message: E.invalidReprintTransition, path: 'status' }]),

  // B-RPT-02: Hành động không được phép theo Ownership Principle (vd. Mangaka review hợp đồng FULL_BUYOUT).
  ActionNotAllowed: () => new ForbiddenException([{ message: E.reprintActionNotAllowed, path: 'status' }]),

  // PB-07: Gán reviser chỉ hợp lệ với revisionMode=WITH_REVISION.
  NotWithRevision: () => new ConflictException([{ message: E.reprintNotWithRevision, path: 'revisionMode' }]),

  // PB-07: Gán reviser chỉ áp dụng cho hợp đồng FULL_BUYOUT.
  ReviserOnlyForFullBuyout: () =>
    new ConflictException([{ message: E.reviserOnlyForFullBuyout, path: 'contractType' }]),

  // PB-07: reviserType=OTHER_MANGAKA nhưng userId không phải role MANGAKA.
  ReviserMangakaNotFound: () =>
    new UnprocessableEntityException([{ message: E.reviserMangakaNotFound, path: 'reviserId' }])
}
