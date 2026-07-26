import { Injectable } from '@nestjs/common'
import { PublicationType, ReaderAuthMethod } from '@prisma/client'
import { generateOTP } from 'src/modules/auth/helpers/otp.helper'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { IdentityHashService } from 'src/infrastructure/crypto/identity-hash.service'
import { VoteOtpNotFoundException } from '../errors/survey.errors'
import { GuestOtpDeliveryPort } from '../ports/guest-otp-delivery.port'
import { VoteOtpRepository, VotePersistenceCommand } from '../vote-otp.repo'

export const normalizeGuestIdentity = (identity: string) => identity.trim().toLowerCase()

@Injectable()
export class SurveyOtpService {
  constructor(
    private readonly voteOtpRepository: VoteOtpRepository,
    private readonly hashingService: HashingService,
    private readonly identityHashService: IdentityHashService,
    private readonly delivery: GuestOtpDeliveryPort
  ) {}

  hashIdentity(identity: string): string {
    return this.identityHashService.hash(normalizeGuestIdentity(identity))
  }

  hashIp(ip: string): string {
    return this.identityHashService.hash(ip.trim())
  }

  async issueEmailOtp(command: {
    identity: string
    ip: string
    expirySeconds: number
    maxAttempts: number
  }): Promise<void> {
    const recipient = normalizeGuestIdentity(command.identity)
    const code = generateOTP()
    const otpCodeHash = await this.hashingService.hash(code)
    const otp = await this.voteOtpRepository.upsertActiveOtp({
      identityHash: this.hashIdentity(recipient),
      otpCodeHash,
      ipHash: this.hashIp(command.ip),
      authMethod: ReaderAuthMethod.EMAIL_OTP,
      expiresAt: new Date(Date.now() + command.expirySeconds * 1000),
      attempts: 0
    })

    try {
      await this.delivery.deliverEmailOtp({
        recipient,
        code,
        expiresInMinutes: Math.max(1, Math.ceil(command.expirySeconds / 60))
      })
    } catch (error) {
      // A later request may already have rotated the compound-key OTP in place.
      // Delete only the exact version whose delivery failed.
      await this.voteOtpRepository.deleteOtpIfCurrent(otp.id, otpCodeHash)
      throw error
    }
  }

  async createVoteWithOtp(command: {
    identity: string
    code: string
    maxAttempts?: number
    vote: VotePersistenceCommand & {
      publicationType: PublicationType | null
      authMethod: ReaderAuthMethod
    }
  }): Promise<void> {
    const identityHash = this.hashIdentity(command.identity)
    if (identityHash !== command.vote.identityHash) throw VoteOtpNotFoundException

    const otp = await this.voteOtpRepository.findActiveOtp(identityHash, command.vote.authMethod)
    const maxAttempts = command.maxAttempts ?? 3
    if (!otp || otp.isUsed || otp.expiresAt <= new Date() || otp.attempts >= maxAttempts) {
      throw VoteOtpNotFoundException
    }

    const matches = await this.hashingService.compare(command.code, otp.otpCodeHash)
    if (!matches) {
      await this.voteOtpRepository.incrementAttempts(otp.id)
      throw VoteOtpNotFoundException
    }

    const result = await this.voteOtpRepository.createVoteAndConsumeOtp({
      otpId: otp.id,
      identityHash,
      authMethod: command.vote.authMethod,
      vote: command.vote
    })
    if (!result.committed) throw VoteOtpNotFoundException
  }
}
