import { PrismaService } from '../../src/infrastructure/database/prisma.service'
import { VoteOtpRepository } from '../../src/modules/survey/vote-otp.repo'

describe('Guest Vote OTP transaction on Mongo replica set', () => {
  const prisma = new PrismaService()
  const repository = new VoteOtpRepository(prisma)
  const fixtureMagazine = 'Guest Vote Integration'
  const identityPrefix = 'guest-vote-integration-'

  beforeAll(async () => {
    await prisma.$connect()
  })

  afterEach(async () => {
    const periods = await prisma.surveyPeriod.findMany({
      where: { magazine: fixtureMagazine },
      select: { id: true }
    })
    const periodIds = periods.map(({ id }) => id)
    await prisma.readerVote.deleteMany({ where: { surveyPeriodId: { in: periodIds } } })
    await prisma.voteOtp.deleteMany({ where: { identityHash: { startsWith: identityPrefix } } })
    await prisma.surveyPeriod.deleteMany({ where: { id: { in: periodIds } } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createFixture = async () => {
    const period = await prisma.surveyPeriod.create({
      data: {
        magazine: fixtureMagazine,
        publicationType: 'WEEKLY',
        issueNumber: 1,
        eligibleSeriesIds: [],
        status: 'OPEN'
      }
    })
    const otp = await prisma.voteOtp.create({
      data: {
        identityHash: `${identityPrefix}${Date.now()}`,
        ipHash: `ip-${Date.now()}`,
        authMethod: 'EMAIL_OTP',
        otpCodeHash: 'bcrypt-hash',
        expiresAt: new Date(Date.now() + 60_000)
      }
    })
    return { period, otp }
  }

  it('allows exactly one winner when two submissions claim the same OTP', async () => {
    const { period, otp } = await createFixture()
    const command = {
      otpId: otp.id,
      identityHash: otp.identityHash,
      authMethod: otp.authMethod,
      vote: {
        surveyPeriodId: period.id,
        seriesIds: [],
        identityHash: otp.identityHash,
        publicationType: 'WEEKLY' as const,
        authMethod: otp.authMethod,
        ipHash: otp.ipHash,
        captchaScore: null,
        voteWeight: 1,
        isFlagged: false
      }
    }

    const results = await Promise.all([
      repository.createVoteAndConsumeOtp(command),
      repository.createVoteAndConsumeOtp(command)
    ])

    expect(results.filter((result) => result.committed)).toHaveLength(1)
    expect(await prisma.readerVote.count({ where: { surveyPeriodId: period.id } })).toBe(1)
    expect((await prisma.voteOtp.findUniqueOrThrow({ where: { id: otp.id } })).isUsed).toBe(true)
  })

  it('rolls the OTP claim back when ReaderVote insertion fails', async () => {
    const { period, otp } = await createFixture()

    await expect(
      repository.createVoteAndConsumeOtp({
        otpId: otp.id,
        identityHash: otp.identityHash,
        authMethod: otp.authMethod,
        vote: {
          surveyPeriodId: period.id,
          seriesIds: ['not-an-object-id'],
          identityHash: otp.identityHash,
          publicationType: 'WEEKLY',
          authMethod: otp.authMethod,
          ipHash: otp.ipHash,
          captchaScore: null,
          voteWeight: 1,
          isFlagged: false
        }
      })
    ).rejects.toBeDefined()

    expect(await prisma.readerVote.count({ where: { surveyPeriodId: period.id } })).toBe(0)
    expect((await prisma.voteOtp.findUniqueOrThrow({ where: { id: otp.id } })).isUsed).toBe(false)
  })
})
