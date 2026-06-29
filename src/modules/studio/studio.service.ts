import { Injectable } from '@nestjs/common'
import { CollaborationInviteService } from './services/collaboration-invite.service'
import { StudioAssignmentService } from './services/studio-assignment.service'
import { CreateInviteBodyType, ListAssignmentsQueryType, ListInvitesQueryType } from './schemas/studio-schemas'

@Injectable()
export class StudioService {
  constructor(
    private readonly collaborationInviteService: CollaborationInviteService,
    private readonly studioAssignmentService: StudioAssignmentService
  ) {}

  // ---- Invites ----
  createInvite(mangakaId: string, body: CreateInviteBodyType) {
    return this.collaborationInviteService.create(mangakaId, body)
  }
  acceptInvite(assistantId: string, inviteId: string) {
    return this.collaborationInviteService.accept(assistantId, inviteId)
  }
  declineInvite(assistantId: string, inviteId: string) {
    return this.collaborationInviteService.decline(assistantId, inviteId)
  }
  cancelInvite(mangakaId: string, inviteId: string) {
    return this.collaborationInviteService.cancel(mangakaId, inviteId)
  }
  getInvite(userId: string, inviteId: string) {
    return this.collaborationInviteService.getById(userId, inviteId)
  }
  listInvites(userId: string, roleName: string, query: ListInvitesQueryType) {
    return this.collaborationInviteService.list(userId, roleName, query)
  }

  // ---- Assignments ----
  terminateAssignment(mangakaId: string, assignmentId: string, reason: string) {
    return this.studioAssignmentService.terminate(mangakaId, assignmentId, reason)
  }
  getAssignment(userId: string, roleName: string, assignmentId: string) {
    return this.studioAssignmentService.getById(userId, roleName, assignmentId)
  }
  listAssignments(userId: string, roleName: string, query: ListAssignmentsQueryType) {
    return this.studioAssignmentService.list(userId, roleName, query)
  }
}
