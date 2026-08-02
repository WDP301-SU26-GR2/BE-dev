import { Demographic, Genre, RoleCode, VotingAuthMode } from '@prisma/client'
import { DEMO_ACCOUNTS, DEMO_SPECIALIZATIONS } from '../demo-data'
import { DAY, requiredAccount, requiredMedia } from './demo-seed.helpers'
import { DemoContext } from './demo-seed.types'

export const seedConfigs = async ({ prisma, accounts }: DemoContext) => {
  const adminId = requiredAccount(accounts, 'editor.naomi').id
  const appConfig = await prisma.appConfig.findFirst()
  if (appConfig) {
    await prisma.appConfig.update({
      where: { id: appConfig.id },
      data: {
        coOwnerApprovalGraceDays: 7,
        storyboardMaxReviewRounds: 8,
        reputationRecommendThreshold: 4,
        hiatusTooLongDays: 30,
        lowVoteReliabilityThreshold: 10,
        maxUploadBytes: 15 * 1024 * 1024,
        assignmentGraceDays: 2
      }
    })
  } else {
    await prisma.appConfig.create({ data: { updatedBy: adminId } })
  }

  const voting = await prisma.votingConfig.findFirst()
  const votingData = {
    updatedBy: adminId,
    authMode: VotingAuthMode.OTP,
    maxSeriesPerVote: 3,
    otpExpirySeconds: 300,
    otpMaxAttempts: 3,
    ipRateLimit: 10,
    phoneRateLimit: 3,
    captchaThreshold: 0.3,
    otpCooldownSeconds: 60,
    ipVotesPerPeriod: 10
  }
  if (voting) await prisma.votingConfig.update({ where: { id: voting.id }, data: votingData })
  else await prisma.votingConfig.create({ data: votingData })

  const board = await prisma.boardConfig.findFirst({ where: { isDefault: true } })
  const boardData = { updatedBy: adminId, boardTotalMembers: 5, quorumMin: 3, approveMajorityRatio: 0.5 }
  if (board) await prisma.boardConfig.update({ where: { id: board.id }, data: boardData })
  else await prisma.boardConfig.create({ data: { ...boardData, isDefault: true } })
}

export const seedProfiles = async ({ prisma, accounts, media, now }: DemoContext) => {
  const mangakas = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.MANGAKA)
  const assistants = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.ASSISTANT)
  const staff = DEMO_ACCOUNTS.filter(
    (account) => account.role === RoleCode.EDITOR || account.role === RoleCode.BOARD_MEMBER
  )
  const rough = requiredMedia(media, 'rough-drafting').key
  const line = requiredMedia(media, 'finished-line-art').key
  const hokusai = requiredMedia(media, 'hokusai-sketchbook').key
  const liveDrawing = requiredMedia(media, 'mangaka-live-drawing').key

  for (const [index, input] of mangakas.entries()) {
    const user = requiredAccount(accounts, input.alias)
    await prisma.mangakaProfile.create({
      data: {
        userId: user.id,
        penName: ['Aki Mori', 'R.T. Hoshi', 'Sora N.'][index],
        genres: index === 0 ? [Genre.ACTION, Genre.FANTASY] : [Genre.DRAMA, Genre.MYSTERY],
        experienceLevel: index === 0 ? 'SENIOR' : 'MID',
        bio: 'Demo persona cho quy trình sáng tác manga. Portfolio dùng tác phẩm có license mở trong manifest.',
        portfolioFiles: [rough, line, hokusai, liveDrawing],
        reputationScore: 4.4 - index * 0.1,
        ratingAvg: 4.6 - index * 0.1,
        ratingCount: 8 - index,
        isRecommended: true
      }
    })
  }

  for (const [index, input] of assistants.entries()) {
    const user = requiredAccount(accounts, input.alias)
    await prisma.assistantProfile.create({
      data: {
        userId: user.id,
        specializations: [...DEMO_SPECIALIZATIONS[index]],
        experienceLevel: index < 2 ? 'SENIOR' : index < 5 ? 'MID' : 'JUNIOR',
        portfolioFiles: [line, requiredMedia(media, 'three-production-versions').key],
        availabilityStatus: index === 5 ? 'BUSY' : 'AVAILABLE',
        availabilityFrom: new Date(now.getTime() - 7 * DAY),
        availabilityTo: new Date(now.getTime() + 45 * DAY),
        reputationScore: 4.55 - index * 0.08,
        ratingAvg: 4.7 - index * 0.08,
        ratingCount: 12 - index,
        isRecommended: index < 5
      }
    })
  }

  for (const [index, input] of staff.entries()) {
    const user = requiredAccount(accounts, input.alias)
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        specialtyGenres: index % 2 === 0 ? [Genre.ACTION, Genre.FANTASY] : [Genre.DRAMA, Genre.MYSTERY],
        demographics: index < 4 ? [Demographic.SHONEN, Demographic.SEINEN] : [Demographic.SHOJO],
        bio: input.role === RoleCode.EDITOR ? 'Tantou Editor phụ trách demo production.' : 'Editorial Board demo.',
        yearsOfExperience: 5 + index * 2
      }
    })
  }
}
