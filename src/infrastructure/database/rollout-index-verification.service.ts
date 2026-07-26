import { type IndexInspectionClient, type RolloutIndexVerification, sameKey } from './audit-rollout.types'

export class RolloutIndexVerificationService {
  constructor(private readonly indexes: IndexInspectionClient) {}

  async verify(): Promise<RolloutIndexVerification> {
    const [transfer, contract, voteOtp] = await Promise.all([
      this.indexes.listIndexes('TransferContract'),
      this.indexes.listIndexes('Contract'),
      this.indexes.listIndexes('VoteOtp')
    ])
    const transferContractRequestUnique = transfer.some(
      (index) => sameKey(index.key, { transferRequestId: 1 }) && index.unique === true
    )
    const contractSourceTransferPartialUnique = contract.some(
      (index) =>
        sameKey(index.key, { sourceTransferRequestId: 1 }) &&
        index.unique === true &&
        index.partialFilterExpression != null
    )
    const voteOtpIdentityMethodUnique = voteOtp.some(
      (index) => sameKey(index.key, { identityHash: 1, authMethod: 1 }) && index.unique === true
    )
    const expiresIndexes = voteOtp.filter((index) => sameKey(index.key, { expiresAt: 1 }))
    const voteOtpExpiresTtl = expiresIndexes.some((index) => index.expireAfterSeconds === 0)
    const conflictingVoteOtpExpiresIndexes = expiresIndexes.filter((index) => index.expireAfterSeconds !== 0).length
    return {
      ok:
        transferContractRequestUnique &&
        contractSourceTransferPartialUnique &&
        voteOtpIdentityMethodUnique &&
        voteOtpExpiresTtl &&
        conflictingVoteOtpExpiresIndexes === 0,
      transferContractRequestUnique,
      contractSourceTransferPartialUnique,
      voteOtpIdentityMethodUnique,
      voteOtpExpiresTtl,
      conflictingVoteOtpExpiresIndexes
    }
  }
}
