import { Demographic, Genre, PublicationType, RoleCode, VotingAuthMode } from '@prisma/client'
import { normalizeMagazine } from 'src/core/http/schemas/magazine.schema'
import { DEMO_ACCOUNTS, DEMO_SPECIALIZATIONS } from '../demo-data'
import { DAY, requiredAccount, requiredMedia } from './demo-seed.helpers'
import { DemoContext } from './demo-seed.types'

export interface DemoMagazineEntry {
  name: string
  publicationTypes: PublicationType[]
}

export const DEMO_MAGAZINES: DemoMagazineEntry[] = [
  { name: 'Manga Nexus Weekly', publicationTypes: [PublicationType.WEEKLY] },
  { name: 'Manga Nexus Monthly', publicationTypes: [PublicationType.MONTHLY] }
]

/**
 * Adds the two demo scopes without deleting an operator's existing magazine catalog.
 * An existing demo entry retains extra supported cadences but always gains its required cadence.
 */
export const mergeDemoMagazines = (current: readonly DemoMagazineEntry[]): DemoMagazineEntry[] => {
  const requiredByName = new Map(DEMO_MAGAZINES.map((entry) => [normalizeMagazine(entry.name), entry]))
  const registered = new Set<string>()
  const merged = current.map((entry) => {
    const required = requiredByName.get(normalizeMagazine(entry.name))
    if (!required) return { name: entry.name, publicationTypes: [...entry.publicationTypes] }

    registered.add(normalizeMagazine(required.name))
    return {
      name: required.name,
      publicationTypes: [...new Set([...entry.publicationTypes, ...required.publicationTypes])]
    }
  })

  for (const required of DEMO_MAGAZINES) {
    if (!registered.has(normalizeMagazine(required.name))) {
      merged.push({ name: required.name, publicationTypes: [...required.publicationTypes] })
    }
  }

  return merged
}

export const seedDemoMagazines = async (prisma: DemoContext['prisma'], adminId: string) => {
  const appConfig = await prisma.appConfig.findFirst({ select: { id: true, magazines: true } })
  const magazines = mergeDemoMagazines(appConfig?.magazines ?? [])
  if (appConfig) {
    await prisma.appConfig.update({ where: { id: appConfig.id }, data: { magazines, updatedBy: adminId } })
  } else {
    await prisma.appConfig.create({ data: { updatedBy: adminId, magazines } })
  }
  return magazines
}

export const seedConfigs = async ({ prisma, accounts }: DemoContext) => {
  const adminId = requiredAccount(accounts, 'admin.hikari').id
  await seedDemoMagazines(prisma, adminId)
  const appConfig = await prisma.appConfig.findFirst({ select: { id: true } })
  if (!appConfig) throw new Error('Demo AppConfig was not created while seeding magazine catalog.')
  await prisma.appConfig.update({
    where: { id: appConfig.id },
    data: {
      updatedBy: adminId,
      coOwnerApprovalGraceDays: 7,
      storyboardMaxReviewRounds: 8,
      reputationRecommendThreshold: 4,
      hiatusTooLongDays: 30,
      lowVoteReliabilityThreshold: 10,
      maxUploadBytes: 15 * 1024 * 1024,
      assignmentGraceDays: 2
    }
  })

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
