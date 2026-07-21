import { Logger } from '@nestjs/common'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PrismaClient, RoleCode, UserStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { DEMO_ACCOUNTS, DEMO_DEFAULT_PASSWORD, DEMO_EMAIL_DOMAIN, DemoAccount } from './demo-data'
import { DEMO_MEDIA, DemoMediaSource, demoMediaDownloadUrl, demoMediaKey } from './demo-media'

const logger = new Logger('DemoSeed')
const MAX_MEDIA_BYTES = 15 * 1024 * 1024

export interface SeededAccount extends DemoAccount {
  id: string
}

export interface SeededMedia {
  id: string
  key: string
  source: DemoMediaSource
}

export const ensureBaseRoles = async (prisma: PrismaClient) => {
  const roles: Array<{ code: RoleCode; description: string; isSystem?: boolean }> = [
    { code: RoleCode.SUPER_ADMIN, description: 'Super Administrator', isSystem: true },
    { code: RoleCode.MANGAKA, description: 'Manga creator' },
    { code: RoleCode.ASSISTANT, description: 'Studio production assistant' },
    { code: RoleCode.EDITOR, description: 'Tantou editor' },
    { code: RoleCode.BOARD_MEMBER, description: 'Editorial board member' }
  ]
  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { description: role.description, isSystem: role.isSystem ?? false },
      create: role
    })
  }
}

export const findDemoAccounts = (prisma: PrismaClient) =>
  prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } }, select: { id: true, email: true } })

export const createDemoAccounts = async (prisma: PrismaClient, password = DEMO_DEFAULT_PASSWORD) => {
  const hash = await bcrypt.hash(password, Number(process.env.SALT_OR_ROUNDS ?? 10))
  const roleRows = await prisma.role.findMany({ select: { id: true, code: true } })
  const roles = new Map(roleRows.map((role) => [role.code, role.id]))
  const result = new Map<string, SeededAccount>()

  for (const input of DEMO_ACCOUNTS) {
    const roleId = roles.get(input.role)
    if (!roleId) throw new Error(`Missing role ${input.role}`)
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        displayName: input.displayName,
        password: hash,
        phoneNumber: input.phoneNumber,
        roleId,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        registrationType:
          input.role === RoleCode.MANGAKA || input.role === RoleCode.ASSISTANT ? 'SELF_REGISTERED' : 'ADMIN_CREATED',
        mustChangePassword: false
      }
    })
    result.set(input.alias, { ...input, id: user.id })
  }
  return result
}

export const seedDemoMedia = async (prisma: PrismaClient, uploadedBy: string, upload: boolean) => {
  const storage = upload ? createStorageClient() : null
  const result = new Map<string, SeededMedia>()

  for (const source of DEMO_MEDIA) {
    const key = demoMediaKey(source)
    if (storage && !(await objectExists(storage.client, storage.bucket, key))) {
      const body = await downloadMedia(source)
      await storage.client.send(
        new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body, ContentType: source.contentType })
      )
      logger.log(`Uploaded media ${source.slug} (${body.length} bytes)`)
      await delay(1_000)
    }
    const asset = await prisma.asset.create({
      data: {
        uploadedBy,
        name: `${source.title} — ${source.license}`,
        filePath: key,
        assetType: mediaAssetType(source)
      }
    })
    result.set(source.slug, { id: asset.id, key, source })
  }
  return result
}

export const verifyDemoMediaObjects = async () => {
  const storage = createStorageClient()
  const missing: string[] = []
  for (const source of DEMO_MEDIA) {
    if (!(await objectExists(storage.client, storage.bucket, demoMediaKey(source)))) missing.push(source.slug)
  }
  return missing
}

export const resetDemoData = async (prisma: PrismaClient) => {
  const users = await findDemoAccounts(prisma)
  if (!users.length) return

  const userIds = users.map((user) => user.id)
  const series = await prisma.series.findMany({ where: { mangakaId: { in: userIds } }, select: { id: true } })
  const seriesIds = series.map((row) => row.id)
  const chapters = await prisma.chapter.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })
  const chapterIds = chapters.map((row) => row.id)
  const pages = await prisma.page.findMany({ where: { chapterId: { in: chapterIds } }, select: { id: true } })
  const pageIds = pages.map((row) => row.id)
  const regions = await prisma.region.findMany({ where: { pageId: { in: pageIds } }, select: { id: true } })
  const regionIds = regions.map((row) => row.id)
  const tasks = await prisma.task.findMany({ where: { pageId: { in: pageIds } }, select: { id: true } })
  const taskIds = tasks.map((row) => row.id)
  const contracts = await prisma.contract.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })
  const contractIds = contracts.map((row) => row.id)
  const conditions = await prisma.paymentCondition.findMany({
    where: { contractId: { in: contractIds } },
    select: { id: true }
  })
  const conditionIds = conditions.map((row) => row.id)
  const amendments = await prisma.contractAmendment.findMany({
    where: { contractId: { in: contractIds } },
    select: { id: true }
  })
  const amendmentIds = amendments.map((row) => row.id)
  const sessions = await prisma.boardSession.findMany({ where: { creatorId: { in: userIds } }, select: { id: true } })
  const sessionIds = sessions.map((row) => row.id)
  const decisions = await prisma.boardDecision.findMany({
    where: { OR: [{ boardSessionId: { in: sessionIds } }, { targetSeriesId: { in: seriesIds } }] },
    select: { id: true }
  })
  const decisionIds = decisions.map((row) => row.id)
  const periods = await prisma.surveyPeriod.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } })
  const periodIds = periods.map((row) => row.id)

  await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } })
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: [...seriesIds, ...chapterIds, ...taskIds] } }] }
  })
  await prisma.revisionRequest.deleteMany({
    where: {
      OR: [
        { requestedBy: { in: userIds } },
        { recipientId: { in: userIds } },
        { targetId: { in: [...seriesIds, ...chapterIds, ...taskIds] } }
      ]
    }
  })
  await prisma.annotation.deleteMany({
    where: {
      OR: [
        { authorId: { in: userIds } },
        { taskId: { in: taskIds } },
        { targetId: { in: [...pageIds, ...regionIds, ...taskIds, ...chapterIds] } }
      ]
    }
  })
  await prisma.aiJob.deleteMany({ where: { pageId: { in: pageIds } } })
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } })
  await prisma.region.deleteMany({ where: { id: { in: regionIds } } })
  await prisma.page.deleteMany({ where: { id: { in: pageIds } } })
  await prisma.deadlineRequest.deleteMany({ where: { chapterId: { in: chapterIds } } })
  await prisma.schedule.deleteMany({ where: { chapterId: { in: chapterIds } } })
  await prisma.manuscript.deleteMany({ where: { chapterId: { in: chapterIds } } })
  await prisma.chapterCoOwnerApproval.deleteMany({ where: { chapterId: { in: chapterIds } } })
  await prisma.chapter.deleteMany({ where: { id: { in: chapterIds } } })
  await prisma.name.deleteMany({ where: { seriesId: { in: seriesIds } } })
  await prisma.readerVote.deleteMany({ where: { surveyPeriodId: { in: periodIds } } })
  await prisma.surveyData.deleteMany({ where: { surveyPeriodId: { in: periodIds } } })
  await prisma.rankingRecord.deleteMany({ where: { surveyPeriodId: { in: periodIds } } })
  await prisma.surveyPeriod.deleteMany({ where: { id: { in: periodIds } } })
  await prisma.tankobonSales.deleteMany({ where: { seriesId: { in: seriesIds } } })
  await prisma.paymentRecord.deleteMany({
    where: { OR: [{ contractId: { in: contractIds } }, { conditionId: { in: conditionIds } }] }
  })
  await prisma.paymentCondition.deleteMany({ where: { id: { in: conditionIds } } })
  await prisma.amendmentSignature.deleteMany({ where: { amendmentId: { in: amendmentIds } } })
  await prisma.contractAmendment.deleteMany({ where: { id: { in: amendmentIds } } })
  await prisma.contractSignature.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.contractVersion.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.contract.deleteMany({ where: { id: { in: contractIds } } })
  await prisma.seriesReport.deleteMany({
    where: { OR: [{ seriesId: { in: seriesIds } }, { boardDecisionId: { in: decisionIds } }] }
  })
  await prisma.boardMessage.deleteMany({ where: { sessionId: { in: sessionIds } } })
  await prisma.boardDecision.deleteMany({ where: { id: { in: decisionIds } } })
  await prisma.boardSession.deleteMany({ where: { id: { in: sessionIds } } })
  await prisma.publicationVersion.deleteMany({ where: { seriesId: { in: seriesIds } } })
  await prisma.series.deleteMany({ where: { id: { in: seriesIds } } })
  await prisma.assistantReview.deleteMany({
    where: { OR: [{ mangakaId: { in: userIds } }, { assistantId: { in: userIds } }] }
  })
  await prisma.mangakaReview.deleteMany({
    where: { OR: [{ editorId: { in: userIds } }, { mangakaId: { in: userIds } }] }
  })
  await prisma.collaborationInvite.deleteMany({
    where: { OR: [{ mangakaId: { in: userIds } }, { assistantId: { in: userIds } }] }
  })
  await prisma.studioAssignment.deleteMany({
    where: { OR: [{ mangakaId: { in: userIds } }, { assistantId: { in: userIds } }] }
  })
  await prisma.mangakaProfile.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.assistantProfile.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.staffProfile.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.asset.deleteMany({ where: { uploadedBy: { in: userIds } } })
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.otpRequest.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  logger.log(`Removed ${users.length} demo accounts and their linked demo records`)
}

const createStorageClient = () => {
  const endpoint = requiredEnv('R2_ENDPOINT')
  const bucket = requiredEnv('R2_BUCKET')
  const client = new S3Client({
    region: requiredEnv('R2_REGION'),
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY')
    }
  })
  return { client, bucket }
}

const objectExists = async (client: S3Client, bucket: string, key: string) => {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 403 || status === 404) return false
    throw error
  }
}

const downloadMedia = async (source: DemoMediaSource) => {
  const maxAttempts = 6
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(demoMediaDownloadUrl(source), {
      redirect: 'follow',
      headers: { 'user-agent': 'MangakaDemoSeed/1.0 (educational demo; Wikimedia Commons attribution retained)' }
    })
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) {
        throw new Error(`Invalid media size for ${source.slug}: ${buffer.length} bytes`)
      }
      const receivedType = response.headers.get('content-type')?.split(';')[0]
      if (receivedType && receivedType !== source.contentType) {
        throw new Error(`Unexpected media type for ${source.slug}: expected ${source.contentType}, got ${receivedType}`)
      }
      return buffer
    }
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Cannot download ${source.slug}: HTTP ${response.status}`)
    }
    const retryAfterSeconds = Number(response.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfterSeconds)
      ? Math.min(30_000, Math.max(1_000, retryAfterSeconds * 1_000))
      : Math.min(30_000, 2 ** attempt * 1_000)
    logger.warn(`Media ${source.slug} returned HTTP ${response.status}; retry ${attempt}/${maxAttempts} in ${waitMs}ms`)
    await delay(waitMs)
  }
  throw new Error(`Cannot download ${source.slug}`)
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const mediaAssetType = (source: DemoMediaSource) => {
  if (source.purpose === 'BACKGROUND_REFERENCE') return 'BACKGROUND' as const
  if (source.purpose === 'TASK_RESULT') return 'OTHER' as const
  return 'REFERENCE' as const
}

const requiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required when DEMO_MEDIA_UPLOAD=true`)
  return value
}
