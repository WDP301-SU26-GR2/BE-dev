import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { SeriesMessages } from '../series.messages'

const E = SeriesMessages.error

export const SeriesNotFoundException = new NotFoundException(E.seriesNotFound)
export const NotSeriesOwnerException = new ForbiddenException(E.notSeriesOwner)
export const ProposalNotEditableException = new ConflictException(E.proposalNotEditable)
export const InvalidSeriesTransitionException = new ConflictException(E.invalidSeriesTransition)
export const InvalidProposalStateException = new ConflictException(E.invalidProposalState)
export const InvalidNameStateException = new ConflictException(E.invalidNameState)
export const SeriesNotReadyToPitchException = new ConflictException(E.seriesNotReadyToPitch)
export const ParentSeriesNotFoundException = new UnprocessableEntityException([
  { message: E.parentSeriesNotFound, path: 'parentSeriesId' }
])
