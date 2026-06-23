import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const SeriesNotFoundException = new NotFoundException('Error.SeriesNotFound')
export const NotSeriesOwnerException = new ForbiddenException('Error.NotSeriesOwner')
export const ProposalNotEditableException = new ConflictException('Error.ProposalNotEditable')
export const InvalidSeriesTransitionException = new ConflictException('Error.InvalidSeriesTransition')
export const InvalidProposalStateException = new ConflictException('Error.InvalidProposalState')
export const InvalidNameStateException = new ConflictException('Error.InvalidNameState')
export const SeriesNotReadyToPitchException = new ConflictException('Error.SeriesNotReadyToPitch')
export const ParentSeriesNotFoundException = new UnprocessableEntityException([
  { message: 'Error.ParentSeriesNotFound', path: 'parentSeriesId' }
])
