import { Injectable } from '@nestjs/common'
import { Prisma, PublicationType, ReaderAuthMethod } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type VotePersistenceCommand = {
  surveyPeriodId: string
  seriesIds: string[]
  identityHash: string
  publicationType: PublicationType | null
  authMethod: ReaderAuthMethod
  ipHash: string
  captchaScore: number | null
  voteWeight: number
  isFlagged: boolean
}

@Injectable()
export class VoteOtpRepository {
  private static readonly TRANSACTION_ATTEMPTS = 3

  constructor(private readonly prisma: PrismaService) {}

  upsertActiveOtp(data: {
    identityHash: string
    otpCodeHash: string
    ipHash: string
    authMethod: ReaderAuthMethod
    expiresAt: Date
    attempts: number
  }) {
    return this.prisma.voteOtp.upsert({
      where: {
        identityHash_authMethod: {
          identityHash: data.identityHash,
          authMethod: data.authMethod
        }
      },
      update: {
        otpCodeHash: data.otpCodeHash,
        ipHash: data.ipHash,
        expiresAt: data.expiresAt,
        attempts: data.attempts,
        isUsed: false
      },
      create: data
    })
  }

  deleteOtpIfCurrent(id: string, otpCodeHash: string) {
    return this.prisma.voteOtp.deleteMany({ where: { id, otpCodeHash } })
  }

  findActiveOtp(identityHash: string, authMethod: ReaderAuthMethod) {
    return this.prisma.voteOtp.findUnique({
      where: { identityHash_authMethod: { identityHash, authMethod } }
    })
  }

  incrementAttempts(id: string) {
    return this.prisma.voteOtp.updateMany({
      where: { id, isUsed: false },
      data: { attempts: { increment: 1 } }
    })
  }

  async createVoteAndConsumeOtp(command: {
    otpId: string
    identityHash: string
    authMethod: ReaderAuthMethod
    vote: VotePersistenceCommand
  }): Promise<{ committed: boolean }> {
    for (let attempt = 1; attempt <= VoteOtpRepository.TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.voteOtp.updateMany({
            where: {
              id: command.otpId,
              identityHash: command.identityHash,
              authMethod: command.authMethod,
              isUsed: false,
              expiresAt: { gt: new Date() }
            },
            data: { isUsed: true }
          })
          if (claimed.count !== 1) return { committed: false }

          await tx.readerVote.create({
            data: command.vote satisfies Prisma.ReaderVoteUncheckedCreateInput
          })
          return { committed: true }
        })
      } catch (error) {
        if (!this.isRetryableWriteConflict(error) || attempt === VoteOtpRepository.TRANSACTION_ATTEMPTS) throw error
        await new Promise((resolve) => setTimeout(resolve, attempt * 5))
      }
    }

    return { committed: false }
  }

  private isRetryableWriteConflict(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true
    if (!(error instanceof Error)) return false
    return /WriteConflict|TransientTransactionError|transaction conflict/i.test(error.message)
  }
}
