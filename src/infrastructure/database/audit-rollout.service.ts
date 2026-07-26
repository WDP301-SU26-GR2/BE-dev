import type { RolloutRedis } from './audit-rollout.types'
import { GuestVoteRolloutService } from './guest-vote-rollout.service'
import { RolloutIndexVerificationService } from './rollout-index-verification.service'
import { TransferRolloutService } from './transfer-rollout.service'

export {
  type IndexInspectionClient,
  LEGACY_VOTE_REDIS_PATTERNS,
  ROLLOUT_APPROVAL,
  type RolloutRedis
} from './audit-rollout.types'

export class AuditRolloutService {
  constructor(
    private readonly transfer: TransferRolloutService,
    private readonly guestVote: GuestVoteRolloutService,
    private readonly indexes: RolloutIndexVerificationService
  ) {}

  async preflight() {
    const [transfer, guestVote] = await Promise.all([this.transfer.preflight(), this.guestVote.preflight()])
    return { transfer, guestVote }
  }

  verify(kind: 'indexes', redis?: RolloutRedis): ReturnType<RolloutIndexVerificationService['verify']>
  verify(kind: 'privacy', redis?: RolloutRedis): ReturnType<GuestVoteRolloutService['verifyPrivacy']>
  verify(kind: 'indexes' | 'privacy', redis?: RolloutRedis) {
    return kind === 'indexes' ? this.indexes.verify() : this.guestVote.verifyPrivacy(redis)
  }

  remediateGuestVote(options: { apply: boolean; approval?: string; redis?: RolloutRedis }) {
    return this.guestVote.remediate(options)
  }

  remediateAcceptedTransfers(options: { ids: string[]; apply: boolean; approval?: string }) {
    return this.transfer.remediateAccepted(options)
  }
}
