import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'

// Run only in a scheduled maintenance window. This flag is required before any database read or write.
const prisma = new PrismaClient()
const COLLECTION = 'Notification'
const BATCH_SIZE = 500
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i
const NOTIFICATION_TYPES = new Set(['SYSTEM', 'CONTRACT', 'TASK', 'DEADLINE', 'SURVEY', 'BOARD', 'REVIEW'])

function commandNumber(value, label) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') return Number(value)

  if (value && typeof value === 'object') {
    for (const key of ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal']) {
      if (typeof value[key] === 'string') return Number(value[key])
    }
  }

  throw new TypeError(`Expected numeric ${label}`)
}

function assertCommandSucceeded(response, action) {
  if (commandNumber(response?.ok, `${action} response ok`) !== 1) {
    throw new Error(`${action} command failed: ${JSON.stringify(response)}`)
  }
}

function assertWriteSucceeded(response, action, expectedCount, requireModifiedCount = false) {
  assertCommandSucceeded(response, action)

  if (Array.isArray(response.writeErrors) && response.writeErrors.length > 0) {
    throw new Error(`${action} returned writeErrors: ${JSON.stringify(response.writeErrors)}`)
  }

  if (response.writeConcernError) {
    throw new Error(`${action} returned a writeConcernError: ${JSON.stringify(response.writeConcernError)}`)
  }

  const affected = commandNumber(response.n, `${action} affected count`)
  if (affected !== expectedCount) {
    throw new Error(`${action} affected ${affected} documents; expected ${expectedCount}`)
  }

  if (requireModifiedCount) {
    const modified = commandNumber(response.nModified, `${action} modified count`)
    if (modified !== expectedCount) {
      throw new Error(`${action} modified ${modified} documents; expected ${expectedCount}`)
    }
  }
}

function hasOnlyOwnKey(value, key) {
  const keys = Reflect.ownKeys(value)
  return keys.length === 1 && keys[0] === key
}

function rawEjsonObjectId(value, fieldName) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !hasOnlyOwnKey(value, '$oid') ||
    typeof value.$oid !== 'string' ||
    !OBJECT_ID_RE.test(value.$oid)
  ) {
    throw new TypeError(`${fieldName} must be a raw EJSON ObjectId with an own 24-character hexadecimal $oid`)
  }

  return value.$oid.toLowerCase()
}

function nullableString(value, fieldName) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  throw new TypeError(`${fieldName} must be a string, null, or missing`)
}

function notificationType(value) {
  const type = nullableString(value, 'type')
  if (type !== '' && !NOTIFICATION_TYPES.has(type)) {
    throw new TypeError(`type must be one of ${[...NOTIFICATION_TYPES].join(', ')}, null, or missing`)
  }
  return type
}

function validTimestamp(timestamp) {
  return Number.isSafeInteger(timestamp) && !Number.isNaN(new Date(timestamp).getTime())
}

function createdAtTimestamp(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOnlyOwnKey(value, '$date')) {
    throw new TypeError(`Notification ${id} has an invalid createdAt value`)
  }

  const rawDate = value.$date
  if (typeof rawDate === 'string') {
    const timestamp = Date.parse(rawDate)
    if (validTimestamp(timestamp)) return timestamp
  }

  if (typeof rawDate === 'number' && validTimestamp(rawDate)) return rawDate

  if (
    rawDate &&
    typeof rawDate === 'object' &&
    !Array.isArray(rawDate) &&
    hasOnlyOwnKey(rawDate, '$numberLong') &&
    typeof rawDate.$numberLong === 'string' &&
    /^-?\d+$/.test(rawDate.$numberLong)
  ) {
    const timestamp = Number(rawDate.$numberLong)
    if (validTimestamp(timestamp)) return timestamp
  }

  throw new TypeError(`Notification ${id} has an invalid createdAt value`)
}

function buildDedupeKey(document) {
  const recipientId = rawEjsonObjectId(document.recipientId, 'recipientId')
  const type = notificationType(document.type)
  const referenceId = document.referenceId == null ? '' : rawEjsonObjectId(document.referenceId, 'referenceId')
  const referenceType = nullableString(document.referenceType, 'referenceType')
  const content = nullableString(document.content, 'content')
  const contentHash = createHash('sha1').update(content).digest('hex').slice(0, 16)

  return `${recipientId}|${type}|${referenceId}|${referenceType}|${contentHash}`
}

function isMissingDedupeKey(value) {
  return value == null || value === ''
}

function strictNotification(rawDocument, requireDedupeKey) {
  const id = rawEjsonObjectId(rawDocument._id, '_id')
  const recipientId = rawEjsonObjectId(rawDocument.recipientId, 'recipientId')
  const referenceId = rawDocument.referenceId == null ? '' : rawEjsonObjectId(rawDocument.referenceId, 'referenceId')
  const type = notificationType(rawDocument.type)
  const referenceType = nullableString(rawDocument.referenceType, 'referenceType')
  const content = nullableString(rawDocument.content, 'content')
  const dedupeKey = nullableString(rawDocument.dedupeKey, 'dedupeKey')
  const createdAt = createdAtTimestamp(rawDocument.createdAt, id)
  const calculatedDedupeKey = buildDedupeKey(rawDocument)

  if (requireDedupeKey && dedupeKey === '') {
    throw new Error(`Notification ${id} has a missing or empty dedupeKey after backfill`)
  }

  if (dedupeKey !== '' && dedupeKey !== calculatedDedupeKey) {
    throw new Error(`Notification ${id} has a dedupeKey that does not match the service formula`)
  }

  return {
    raw: rawDocument,
    rawId: rawDocument._id,
    id,
    recipientId,
    referenceId,
    type,
    referenceType,
    content,
    dedupeKey,
    calculatedDedupeKey,
    createdAt
  }
}

async function rawNotificationCount() {
  const response = await prisma.$runCommandRaw({ count: COLLECTION, query: {} })
  assertCommandSucceeded(response, 'raw Notification count')
  return commandNumber(response.n, 'raw Notification count')
}

async function readAllNotifications() {
  const documents = []
  let lastRawId

  while (true) {
    const filter = lastRawId === undefined ? {} : { _id: { $gt: lastRawId } }
    const response = await prisma.$runCommandRaw({
      find: COLLECTION,
      filter,
      sort: { _id: 1 },
      limit: BATCH_SIZE,
      batchSize: BATCH_SIZE,
      singleBatch: true,
      projection: {
        _id: 1,
        recipientId: 1,
        type: 1,
        referenceId: 1,
        referenceType: 1,
        content: 1,
        createdAt: 1,
        dedupeKey: 1
      }
    })
    assertCommandSucceeded(response, 'stateless find')

    if (!response.cursor || typeof response.cursor !== 'object' || !Array.isArray(response.cursor.firstBatch)) {
      throw new Error(`Stateless find did not return firstBatch: ${JSON.stringify(response)}`)
    }

    const page = response.cursor.firstBatch
    if (page.length === 0) break
    documents.push(...page)
    lastRawId = page[page.length - 1]._id
  }

  const count = await rawNotificationCount()
  if (documents.length !== count) {
    throw new Error(`Stateless scan returned ${documents.length} Notifications; raw count returned ${count}`)
  }

  return documents
}

async function scanStrictNotifications(requireDedupeKey) {
  return (await readAllNotifications()).map((document) => strictNotification(document, requireDedupeKey))
}

function exactFieldFilter(fieldName, value) {
  if (value === undefined) return { [fieldName]: { $exists: false } }
  if (value === null) return { $and: [{ [fieldName]: null }, { [fieldName]: { $exists: true } }] }
  return { [fieldName]: value }
}

function sourceFieldFilters(document) {
  return [
    exactFieldFilter('_id', document.raw._id),
    exactFieldFilter('recipientId', document.raw.recipientId),
    exactFieldFilter('type', document.raw.type),
    exactFieldFilter('referenceId', document.raw.referenceId),
    exactFieldFilter('referenceType', document.raw.referenceType),
    exactFieldFilter('content', document.raw.content),
    exactFieldFilter('createdAt', document.raw.createdAt)
  ]
}

function backfillCasFilter(document) {
  return {
    $and: [
      ...sourceFieldFilters(document),
      exactFieldFilter('dedupeKey', document.raw.dedupeKey),
      { $or: [{ dedupeKey: { $exists: false } }, { dedupeKey: null }, { dedupeKey: '' }] }
    ]
  }
}

function deleteCasFilter(document) {
  return {
    $and: [...sourceFieldFilters(document), exactFieldFilter('dedupeKey', document.raw.dedupeKey)]
  }
}

async function backfillDedupeKeys(documents) {
  let backfilled = 0

  for (const document of documents) {
    if (!isMissingDedupeKey(document.raw.dedupeKey)) continue

    const response = await prisma.$runCommandRaw({
      update: COLLECTION,
      updates: [
        {
          q: backfillCasFilter(document),
          u: { $set: { dedupeKey: document.calculatedDedupeKey } },
          multi: false,
          upsert: false
        }
      ],
      ordered: true
    })
    assertWriteSucceeded(response, `backfill update for ${document.id}`, 1, true)
    backfilled += 1
  }

  return backfilled
}

function groupByDedupeKey(documents) {
  const groups = new Map()

  for (const document of documents) {
    if (document.dedupeKey === '') throw new Error(`Notification ${document.id} has an empty dedupeKey`)
    const group = groups.get(document.dedupeKey) ?? []
    group.push(document)
    groups.set(document.dedupeKey, group)
  }

  return groups
}

function compareNotifications(left, right) {
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
  return left.id.localeCompare(right.id)
}

function duplicateGroups(documents) {
  return [...groupByDedupeKey(documents).values()].filter((group) => group.length > 1)
}

async function deleteDuplicateLosers(groups) {
  let deleted = 0

  for (const group of groups) {
    const sorted = [...group].sort(compareNotifications)
    for (const loser of sorted.slice(1)) {
      const response = await prisma.$runCommandRaw({
        delete: COLLECTION,
        deletes: [{ q: deleteCasFilter(loser), limit: 1 }],
        ordered: true
      })
      assertWriteSucceeded(response, `duplicate delete for ${loser.id}`, 1)
      deleted += 1
    }
  }

  return deleted
}

function requireMaintenanceMode() {
  if (process.env.MIGRATION_MAINTENANCE_MODE !== '1') {
    throw new Error(
      'MIGRATION_MAINTENANCE_MODE=1 is required before this migration reads or writes Notification documents. Run only during a scheduled maintenance window.'
    )
  }
}

async function runMigration() {
  const summary = {
    preflightScanned: 0,
    backfilled: 0,
    duplicateGroupsDeleted: 0,
    deleted: 0,
    finalScanned: 0,
    finalDuplicateGroups: 0
  }

  try {
    requireMaintenanceMode()

    const preflight = await scanStrictNotifications(false)
    summary.preflightScanned = preflight.length
    summary.backfilled = await backfillDedupeKeys(preflight)

    const afterBackfill = await scanStrictNotifications(true)
    const groups = duplicateGroups(afterBackfill)
    summary.duplicateGroupsDeleted = groups.length
    summary.deleted = await deleteDuplicateLosers(groups)

    const finalDocuments = await scanStrictNotifications(true)
    summary.finalScanned = finalDocuments.length
    summary.finalDuplicateGroups = duplicateGroups(finalDocuments).length
    if (summary.finalDuplicateGroups > 0) {
      throw new Error(`Final verification failed: duplicateGroups=${summary.finalDuplicateGroups}`)
    }
  } finally {
    console.log('Notification dedupe migration summary')
    console.log(`  preflight scanned: ${summary.preflightScanned}`)
    console.log(`  backfilled: ${summary.backfilled}`)
    console.log(`  duplicate groups deleted: ${summary.duplicateGroupsDeleted}`)
    console.log(`  deleted: ${summary.deleted}`)
    console.log(`  final scanned: ${summary.finalScanned}`)
    console.log(`  final duplicate groups: ${summary.finalDuplicateGroups}`)

    await prisma.$disconnect()
  }
}

try {
  await runMigration()
} catch (error) {
  console.error('Notification dedupe migration failed:', error)
  process.exitCode = 1
}
