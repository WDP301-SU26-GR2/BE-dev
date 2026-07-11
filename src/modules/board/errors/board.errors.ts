import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { BoardMessages } from '../board.messages'

const E = BoardMessages.error

export const SessionAlreadyExistsException = new ConflictException([{ message: E.sessionAlreadyExists, path: 'title' }])
export const SessionNotFoundException = new NotFoundException([{ message: E.sessionNotFound, path: 'sessionId' }])
export const BoardConfigNotFoundException = new NotFoundException([{ message: E.boardConfigNotFound, path: 'config' }])
export const DecisionNotFoundException = new NotFoundException([{ message: E.decisionNotFound, path: 'decisionId' }])
export const SessionNotOpenException = new BadRequestException([{ message: E.sessionNotOpen, path: 'status' }])
export const InvalidBoardMembersException = new UnprocessableEntityException([
  { message: E.invalidBoardMembers, path: 'allowedEditorIds' }
])
export const InvalidQuorumException = new UnprocessableEntityException([
  { message: E.invalidQuorum, path: 'quorumMin' }
])
export const VoterNotAllowedException = new ForbiddenException([{ message: E.voterNotAllowed, path: 'voterId' }])
export const VoterAlreadyVotedException = new ConflictException([{ message: E.voterAlreadyVoted, path: 'voterId' }])
export const ConfigLockedException = new BadRequestException([{ message: E.configLocked, path: 'config' }])
export const SessionClosedReportException = new BadRequestException([
  { message: E.sessionClosedReport, path: 'sessionId' }
])
export const ReportNotFoundException = new NotFoundException([{ message: E.reportNotFound, path: 'reportId' }])
export const EditorNotInvitedException = new ForbiddenException([{ message: E.editorNotInvited, path: 'userId' }])
export const InvalidBoardSessionTransitionException = new ConflictException([
  { message: E.invalidSessionTransition, path: 'status' }
])
export const NotSessionCreatorException = new ForbiddenException([{ message: E.notSessionCreator, path: 'sessionId' }])
