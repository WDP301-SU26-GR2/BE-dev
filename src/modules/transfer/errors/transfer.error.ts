import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { TransferMessages } from './transfer.message'

const E = TransferMessages.error

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
export const NotTheCoOwnerForChapterException = new ForbiddenException(E.notTheCoOwnerForChapter)
export const ChapterApprovalIsNotPendingException = new BadRequestException(E.chapterApprovalIsNotPending)
