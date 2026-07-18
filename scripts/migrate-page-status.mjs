// Spec 18: migrate legacy PageStatus/ManuscriptStatus values before `prisma db push`.
// Raw Mongo commands are mandatory because the regenerated Prisma Client cannot hydrate legacy enum values.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 500

function numberField(value) {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && '$numberLong' in value) return Number(value.$numberLong)
  return 0
}

function assertSucceeded(result, label) {
  if (!result || numberField(result.ok) !== 1) {
    throw new Error(`${label} failed: ${JSON.stringify(result)}`)
  }
}

async function command(command, label) {
  const result = await prisma.$runCommandRaw(command)
  assertSucceeded(result, label)
  return result
}

async function findRevisingChapterIds() {
  const ids = []
  let lastId

  while (true) {
    const result = await command(
      {
        find: 'Manuscript',
        filter: {
          status: 'EDITOR_REVISION',
          ...(lastId === undefined ? {} : { _id: { $gt: lastId } })
        },
        projection: { _id: 1, chapterId: 1 },
        sort: { _id: 1 },
        limit: BATCH_SIZE,
        batchSize: BATCH_SIZE,
        singleBatch: true
      },
      'find EDITOR_REVISION manuscripts'
    )
    const batch = result.cursor?.firstBatch
    if (!Array.isArray(batch)) throw new Error(`Invalid find cursor: ${JSON.stringify(result)}`)
    if (batch.length === 0) break
    ids.push(...batch.map((row) => row.chapterId))
    lastId = batch[batch.length - 1]._id
  }

  return ids
}

async function count(collection, query, label) {
  const result = await command({ count: collection, query }, label)
  return numberField(result.n)
}

async function updateMany(collection, query, update, label) {
  if (DRY_RUN) return 0
  const result = await command(
    { update: collection, updates: [{ q: query, u: update, multi: true }] },
    label
  )
  return numberField(result.nModified)
}

async function main() {
  console.log(DRY_RUN ? '=== PAGE STATUS MIGRATION: DRY RUN ===' : '=== PAGE STATUS MIGRATION: APPLY ===')

  const revisingChapterIds = await findRevisingChapterIds()
  const revisingQuery = {
    chapterId: { $in: revisingChapterIds },
    status: { $ne: 'REVISING' }
  }
  const revisingPages = revisingChapterIds.length === 0 ? 0 : await count('Page', revisingQuery, 'count revising pages')
  console.log(`EDITOR_REVISION chapters=${revisingChapterIds.length}; pages -> REVISING=${revisingPages}`)
  if (revisingChapterIds.length > 0) {
    const modified = await updateMany('Page', revisingQuery, { $set: { status: 'REVISING' } }, 'migrate revising pages')
    console.log(`modified pages -> REVISING=${modified}`)
  }

  const legacyStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPOSITE_READY']
  const legacyPageQuery = { status: { $in: legacyStatuses } }
  const legacyPages = await count('Page', legacyPageQuery, 'count legacy pages')
  console.log(`legacy pages -> DRAFT=${legacyPages}`)
  const draftModified = await updateMany('Page', legacyPageQuery, { $set: { status: 'DRAFT' } }, 'migrate legacy pages')
  console.log(`modified pages -> DRAFT=${draftModified}`)

  const legacyManuscriptQuery = { status: 'COMPOSITE_REVIEW' }
  const legacyManuscripts = await count('Manuscript', legacyManuscriptQuery, 'count legacy manuscripts')
  console.log(`COMPOSITE_REVIEW manuscripts -> IN_PRODUCTION=${legacyManuscripts}`)
  const manuscriptModified = await updateMany(
    'Manuscript',
    legacyManuscriptQuery,
    { $set: { status: 'IN_PRODUCTION' } },
    'migrate legacy manuscripts'
  )
  console.log(`modified manuscripts -> IN_PRODUCTION=${manuscriptModified}`)

  const invalidPages = await count(
    'Page',
    { status: { $nin: ['DRAFT', 'COMPLETED', 'REVISING'] } },
    'verify page statuses'
  )
  const invalidManuscripts = await count('Manuscript', legacyManuscriptQuery, 'verify manuscript statuses')
  console.log(`VERIFY invalidPageStatus=${invalidPages}; compositeReview=${invalidManuscripts}`)

  if (!DRY_RUN && (invalidPages > 0 || invalidManuscripts > 0)) {
    throw new Error('Migration verification failed; do not run prisma db push')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
