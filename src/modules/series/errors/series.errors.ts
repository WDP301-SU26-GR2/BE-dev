import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { SeriesMessages } from '../series.messages'

const E = SeriesMessages.error

export const SeriesNotFoundException = new NotFoundException(E.seriesNotFound)
export const NotSeriesOwnerException = new ForbiddenException(E.notSeriesOwner)
export const ProposalNotEditableException = new ConflictException(E.proposalNotEditable)
export const InvalidSeriesTransitionException = new ConflictException(E.invalidSeriesTransition)
export const SeriesNotInEndingStateException = new ConflictException(E.seriesNotInEndingState)
export const InvalidProposalStateException = new ConflictException(E.invalidProposalState)
export const InvalidNameStateException = new ConflictException(E.invalidNameState)
export const SeriesNotReadyToPitchException = new ConflictException(E.seriesNotReadyToPitch)
export const SeriesAccessDeniedException = new ForbiddenException(E.seriesAccessDenied)
export const NameNotFoundException = new NotFoundException(E.nameNotFound)
export const SeriesAlreadyClaimedException = new ConflictException(E.seriesAlreadyClaimed)
export const ReviewAlreadyStartedException = new ConflictException(E.reviewAlreadyStarted)
export const NotAssignedEditorException = new ForbiddenException(E.notAssignedEditor)
export const ProposalNotDeletableException = new ConflictException(E.proposalNotDeletable)
export const ParentSeriesNotFoundException = new UnprocessableEntityException([
  { message: E.parentSeriesNotFound, path: 'parentSeriesId' }
])
export const FranchiseConsentRequiredException = new ConflictException(E.franchiseConsentRequired)
export const NotOriginalMangakaException = new ForbiddenException(E.notOriginalMangaka)
export const NotFranchiseConsentTargetException = new ConflictException(E.notFranchiseConsentTarget)
