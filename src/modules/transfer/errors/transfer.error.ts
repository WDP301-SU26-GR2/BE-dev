import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { TransferMessages } from '../transfer.messages'

const E = TransferMessages.error

export const InvalidTransferStateException = new ConflictException([
  { message: E.invalidTransferState, path: 'status' }
])
export const ValuationRequiredException = new BadRequestException([
  { message: E.valuationRequired, path: 'valuationAmount' }
])
export const NoActiveContractFoundException = new BadRequestException(E.noActiveContractFound)
export const TransferRequestNotFoundException = new NotFoundException(E.transferRequestNotFound)
export const InvalidStatusForScreeningException = new BadRequestException(E.invalidStatusForScreening)
export const OnlyAppliesToFullBuyoutException = new BadRequestException(E.onlyAppliesToFullBuyout)
export const OriginalContractIdNotFoundException = new BadRequestException(E.originalContractIdNotFound)
export const OnlyAppliesToRevenueShareException = new BadRequestException(E.onlyAppliesToRevenueShare)
export const RequestNotInNegotiatingStageException = new BadRequestException(E.requestNotInNegotiatingStage)
export const TransferContractNotFoundException = new NotFoundException(E.transferContractNotFound)
export const UserOrEmailNotFoundException = new NotFoundException(E.userOrEmailNotFound)
export const UserHasAlreadySignedContractException = new BadRequestException(E.userHasAlreadySignedContract)
export const TransferContractNotFoundAfterUpdateException = new NotFoundException(E.transferContractNotFoundAfterUpdate)
export const TransferAccessDeniedException = new ForbiddenException(E.accessDenied)
export const InvalidTransferBoardDecisionException = new UnprocessableEntityException([
  { message: E.invalidBoardDecision, path: 'boardDecisionId' }
])
export const RequestingMangakaInactiveException = new ForbiddenException(E.requestingMangakaInactive)
export const RequesterAlreadyOwnsSeriesException = new ConflictException(E.requesterAlreadyOwnsSeries)
export const InvalidTransferProposalException = new UnprocessableEntityException([
  { message: E.invalidProposal, path: 'proposedPercentage' }
])
export const NotTheCoOwnerForChapterException = new ForbiddenException(E.notTheCoOwnerForChapter)
export const ChapterApprovalIsNotPendingException = new BadRequestException(E.chapterApprovalIsNotPending)
