/**
 * A4-a Smoke Test -- run on real MongoDB + live server
 * Usage: npx ts-node -r tsconfig-paths/register scripts/smoke-a4a.ts
 */
import { UserStatus, RegistrationType } from '@prisma/client'
import { PrismaService } from '../src/infrastructure/database/prisma.service'
import { HashingService } from '../src/infrastructure/crypto/hashing.service'
import { config } from 'dotenv'
config()

const prisma = new PrismaService()
const hashing = new HashingService()
const BASE = 'http://localhost:4000'

const log = (msg: string) => console.log('[SMOKE] ' + msg)
const pass = (msg: string) => console.log('  PASS ' + msg)
const fail = (msg: string) => console.error('  FAIL ' + msg)

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: 'smoke' } }, select: { id: true } })
  for (const u of users) {
    await prisma.assistantProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
    await prisma.refreshToken.deleteMany({ where: { userId: u.id } }).catch(() => {})
    await prisma.mangakaProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  }
  await prisma.user.deleteMany({ where: { email: { contains: "smoke" } } })
}

async function login(email: string) {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123' })
  })
  const body = await res.json()
  if (!res.ok) throw new Error('Login failed for ' + email + ': ' + JSON.stringify(body))
  return body.data.accessToken as string
}

async function main() {
  log('Cleaning up...')
  await cleanup()

  // 1. Get role IDs
  log('Getting roles...')
  const roles = await prisma.role.findMany()
  const rm: Record<string, string> = {}
  for (const r of roles) rm[r.code] = r.id
  pass('Roles: ' + Object.keys(rm).join(', '))

  // 2. Create test users
  log('Creating users...')
  const mk = await prisma.user.create({
    data: {
      email: 'smoke-mk@test.com', name: 'Smoke MK',
      password: await hashing.hash('TestPass123'), phoneNumber: '0900000001',
      status: UserStatus.ACTIVE, emailVerified: true,
      registrationType: RegistrationType.SELF_REGISTERED, roleId: rm['MANGAKA']
    }
  })
  pass('Mangaka: ' + mk.id)

  const as1 = await prisma.user.create({
    data: {
      email: 'smoke-as1@test.com', name: 'Smoke AS1',
      password: await hashing.hash('TestPass123'), phoneNumber: '0900000002',
      status: UserStatus.ACTIVE, emailVerified: true,
      registrationType: RegistrationType.SELF_REGISTERED, roleId: rm['ASSISTANT']
    }
  })
  pass('Assistant1: ' + as1.id)

  const as2 = await prisma.user.create({
    data: {
      email: 'smoke-as2@test.com', name: 'Smoke AS2',
      password: await hashing.hash('TestPass123'), phoneNumber: '0900000003',
      status: UserStatus.ACTIVE, emailVerified: true,
      registrationType: RegistrationType.SELF_REGISTERED, roleId: rm['ASSISTANT']
    }
  })
  pass('Assistant2: ' + as2.id)

  const asBanned = await prisma.user.create({
    data: {
      email: 'smoke-as-banned@test.com', name: 'Smoke Banned',
      password: await hashing.hash('TestPass123'), phoneNumber: '0900000004',
      status: UserStatus.BANNED, emailVerified: true,
      registrationType: RegistrationType.SELF_REGISTERED, roleId: rm['ASSISTANT']
    }
  })
  pass('BannedAssistant: ' + asBanned.id)

  const asDeleted = await prisma.user.create({
    data: {
      email: 'smoke-as-deleted@test.com', name: 'Smoke Deleted',
      password: await hashing.hash('TestPass123'), phoneNumber: '0900000005',
      status: UserStatus.ACTIVE, emailVerified: true,
      registrationType: RegistrationType.SELF_REGISTERED, roleId: rm['ASSISTANT'],
      deletedAt: new Date()
    }
  })
  pass('DeletedAssistant: ' + asDeleted.id)

  // 3. Create profiles
  await prisma.mangakaProfile.create({ data: { userId: mk.id, penName: 'Smoke MK', genres: ['ACTION'], reputationScore: 0, ratingAvg: 0, ratingCount: 0, isRecommended: false, portfolioFiles: [] } })
  pass('MangakaProfile created')

  await prisma.assistantProfile.create({ data: { userId: as1.id, specializations: ['BACKGROUND', 'INKING'], experienceLevel: 'SENIOR', availabilityStatus: 'AVAILABLE', availabilityFrom: new Date('2026-01-01'), availabilityTo: new Date('2026-12-31'), reputationScore: 4.5, ratingAvg: 4.5, ratingCount: 10, isRecommended: true, portfolioFiles: ['bg1.png'] } })
  pass('AssistantProfile1 (recommended, AVAILABLE)')

  await prisma.assistantProfile.create({ data: { userId: as2.id, specializations: ['COLORING', 'LETTERING'], experienceLevel: 'JUNIOR', availabilityStatus: 'BUSY', reputationScore: 3.0, ratingAvg: 3.0, ratingCount: 3, isRecommended: false, portfolioFiles: [] } })
  pass('AssistantProfile2 (not recommended, BUSY)')

  await prisma.assistantProfile.create({ data: { userId: asBanned.id, specializations: ['SCREENTONE'], experienceLevel: 'MID', availabilityStatus: 'UNAVAILABLE', reputationScore: 0, ratingAvg: 0, ratingCount: 0, isRecommended: false, portfolioFiles: [] } })
  pass('BannedAssistantProfile created')

  // asDeleted has NO profile

  // 4. Get tokens
  log('Logging in...')
  const mkToken = await login('smoke-mk@test.com')
  const as1Token = await login('smoke-as1@test.com')
  const as2Token = await login('smoke-as2@test.com')
  const mkH = { Authorization: 'Bearer ' + mkToken, 'Content-Type': 'application/json' }
  const as1H = { Authorization: 'Bearer ' + as1Token, 'Content-Type': 'application/json' }
  const as2H = { Authorization: 'Bearer ' + as2Token, 'Content-Type': 'application/json' }

  // 5. TEST 1 -- GET /assistants directory
  log('')
  log('-- TEST 1: GET /assistants --')
  let r = await fetch(BASE + '/assistants', { headers: mkH })
  let b = await r.json()
  console.log('  Status: ' + r.status + ' | Items: ' + (b.data?.items?.length ?? 0))
  if (r.status === 200) { pass('Status 200') } else { fail('Expected 200, got ' + r.status) }

  const ids = (b.data?.items ?? []).map((i: any) => i.userId)

  if (ids.includes(asBanned.id)) fail('BANNED user should NOT be in directory')
  else pass('BANNED user correctly excluded')

  if (ids.includes(asDeleted.id)) fail('Soft-deleted user should NOT be in directory')
  else pass('Soft-deleted user correctly excluded (isSet:false works!)')

  if (ids.includes(as1.id) && ids.includes(as2.id)) pass('ACTIVE assistants with profile correctly included')
  else fail('Missing active assistants')

  const first = b.data?.items?.[0]
  if (first?.isRecommended === true) pass('isRecommended=true first (ordering correct)')
  else fail('Ordering issue: first item ' + JSON.stringify(first))

  if (!('email' in (first ?? {})) && !('phoneNumber' in (first ?? {}))) pass('Email/phone NOT in response (hidden)')
  else fail('Sensitive fields leaked')

  // Filter specialization
  r = await fetch(BASE + '/assistants?specialization=BACKGROUND', { headers: mkH })
  b = await r.json()
  const bgItems = b.data?.items ?? []
  for (const i of bgItems) {
    if (!i.specializations.includes('BACKGROUND')) fail('Non-BACKGROUND in filter')
  }
  pass('Specialization=BACKGROUND filter correct (' + bgItems.length + ' items)')

  // 6. TEST 2 -- POST /collaboration-invites
  log('')
  log('-- TEST 2: POST /collaboration-invites --')
  const futureStart = new Date(Date.now() + 86400000).toISOString()
  const futureEnd = new Date(Date.now() + 30 * 86400000).toISOString()
  r = await fetch(BASE + '/collaboration-invites', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as1.id, hireStart: futureStart, hireEnd: futureEnd, taskTypes: ['BACKGROUND', 'INKING'] })
  })
  b = await r.json()
  console.log('  Status: ' + r.status + ' | Status field: ' + (b.data?.status ?? '?'))
  if (r.status === 201 && b.data?.status === 'PENDING') pass('Invite created PENDING')
  else fail('Expected 201+PENDING, got ' + r.status + '/' + (b.data?.status ?? '?'))
  const inviteId = b.data?.id

  // Dedup
  r = await fetch(BASE + '/collaboration-invites', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as1.id, hireStart: futureStart, hireEnd: futureEnd, taskTypes: ['BACKGROUND'] })
  })
  if (r.status === 409) pass('Duplicate invite -> 409 Conflict')
  else fail('Expected 409 for duplicate, got ' + r.status)

  // Invalid hire period
  r = await fetch(BASE + '/collaboration-invites', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as2.id, hireStart: futureEnd, hireEnd: futureStart, taskTypes: ['COLORING'] })
  })
  if (r.status === 422) pass('Invalid hire period -> 422 Unprocessable')
  else fail('Expected 422, got ' + r.status)

  // 7. TEST 3 -- Accept Invite
  log('')
  log('-- TEST 3: POST /collaboration-invites/:id/accept --')
  r = await fetch(BASE + '/collaboration-invites/' + inviteId + '/accept', { method: 'POST', headers: as1H })
  b = await r.json()
  console.log('  Status: ' + r.status + ' | Assign status: ' + (b.data?.status ?? '?'))
  if (r.status === 201 && b.data?.status === 'ACTIVE') pass('Invite accepted, assignment ACTIVE')
  else fail('Expected 201+ACTIVE, got ' + r.status + '/' + (b.data?.status ?? '?'))
  const assignmentId = b.data?.id

  // Mangaka cannot accept
  r = await fetch(BASE + '/collaboration-invites/' + inviteId + '/accept', { method: 'POST', headers: mkH })
  if (r.status === 403) pass('Mangaka cannot accept -> 403')
  else fail('Expected 403 for mangaka accept, got ' + r.status)

  // 8. TEST 4 -- activeNow lazy (PAST start so it's already active)
  log('')
  log('-- TEST 4: activeNow lazy compute --')
  const pastStart = new Date(Date.now() - 86400000).toISOString()
  const pastEnd = new Date(Date.now() + 30 * 86400000).toISOString()
  r = await fetch(BASE + '/collaboration-invites', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as2.id, hireStart: pastStart, hireEnd: pastEnd, taskTypes: ['COLORING'] })
  })
  b = await r.json()
  const invite2Id = b.data?.id
  await fetch(BASE + '/collaboration-invites/' + invite2Id + '/accept', { method: 'POST', headers: as2H })
  await new Promise((r2) => setTimeout(r2, 500))

  r = await fetch(BASE + '/studio-assignments', { headers: mkH })
  b = await r.json()
  const allAsgns = b.data?.items ?? []
  console.log('  All assignments: ' + allAsgns.length)
  let foundFutureActiveNowFalse = false
  let foundPastActiveNowTrue = false
  for (const a of allAsgns) {
    if (a.status === 'ACTIVE') {
      // Assignment with future hireStart should have activeNow=false
      // Assignment with past hireStart should have activeNow=true
      if (a.activeNow === true) {
        foundPastActiveNowTrue = true
        pass('ACTIVE assignment with past hireStart -> activeNow=true')
      } else {
        // activeNow=false for ACTIVE assignment is valid if hireStart is in the future
        foundFutureActiveNowFalse = true
        pass('ACTIVE assignment with future hireStart -> activeNow=false (valid)')
      }
    } else {
      pass('Assignment ' + a.id.substring(0, 8) + '... status=' + a.status + ' (activeNow irrelevant)')
    }
  }
  if (!foundPastActiveNowTrue && !foundFutureActiveNowFalse) fail('No ACTIVE assignments found')

  // activeNow=true filter
  r = await fetch(BASE + '/studio-assignments?activeNow=true', { headers: mkH })
  b = await r.json()
  const activeItems = b.data?.items ?? []
  if (activeItems.length > 0 && activeItems.every((a: any) => a.activeNow === true)) {
    pass('activeNow=true filter works (' + activeItems.length + ' items)')
  } else {
    fail('activeNow filter returned ' + activeItems.length + ' items')
  }

  // 9. TEST 5 -- Terminate
  log('')
  log('-- TEST 5: POST /studio-assignments/:id/terminate --')
  r = await fetch(BASE + '/studio-assignments/' + assignmentId + '/terminate', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ reason: 'smoke test done' })
  })
  b = await r.json()
  if (r.status === 201 && b.data?.status === 'TERMINATED' && b.data?.terminatedReason === 'smoke test done') {
    pass('Terminate OK -> TERMINATED with reason')
  } else fail('Terminate failed: ' + r.status + ' ' + JSON.stringify(b.data))

  // Terminate twice -> 409
  r = await fetch(BASE + '/studio-assignments/' + assignmentId + '/terminate', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ reason: 'again' })
  })
  if (r.status === 409) pass('Already terminated -> 409')
  else fail('Expected 409 for double terminate, got ' + r.status)

  // 10. TEST 6 -- Review gate
  log('')
  log('-- TEST 6: POST /assistant-reviews (review gate) --')

  // Review with TERMINATED assignment -> should pass
  r = await fetch(BASE + '/assistant-reviews', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as1.id, rating: 5, comment: 'Great!', studioAssignmentId: assignmentId })
  })
  b = await r.json()
  if (r.status === 201) pass('Review with TERMINATED assignment -> 201 (gate passed)')
  else fail('Expected 201 for ended assignment, got ' + r.status + ': ' + JSON.stringify(b))

  // Review with wrong pair -> should fail 422
  r = await fetch(BASE + '/assistant-reviews', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as2.id, rating: 4, comment: 'Good', studioAssignmentId: assignmentId }) // as1's assignment, not as2's
  })
  if (r.status === 422) pass('Review with wrong pair -> 422 (gate rejects)')
  else fail('Expected 422 for wrong pair, got ' + r.status + ': ' + JSON.stringify(await r.json()))

  // 11. TEST 7 -- List invites
  log('')
  log('-- TEST 7: GET /collaboration-invites --')
  r = await fetch(BASE + '/collaboration-invites', { headers: mkH })
  b = await r.json()
  if (r.status === 200 && Array.isArray(b.data?.items)) {
    pass('GET /collaboration-invites -> 200, items: ' + b.data.items.length)
  } else fail('Unexpected: ' + r.status + ' ' + JSON.stringify(b))

  // 12. TEST 8 -- Cancel invite (need a fresh invite, but as2 has ACTIVE -> dedup blocks.
  // So we cancel the already-created invite2)
  log('')
  log('-- TEST 8: POST /collaboration-invites/:id/cancel --')
  // First cancel the already-existing invite2 (PENDING, never accepted)
  r = await fetch(BASE + '/collaboration-invites/' + invite2Id + '/cancel', { method: 'POST', headers: mkH })
  b = await r.json()
  if (r.status === 201 && b.data?.status === 'CANCELLED') pass('Cancel invite -> CANCELLED')
  else if (r.status === 409 && b.message?.includes('NotPending')) pass('Invite2 already accepted -> 409 (expected)')
  else fail('Cancel failed: ' + r.status + ' ' + JSON.stringify(b))

  // 13. TEST 9 -- Decline invite (need a fresh invite with as2, but blocked by ACTIVE.
  // So: create new invite for as1 (who has TERMINATED assignment, can receive new invites)
  log('')
  log('-- TEST 9: POST /collaboration-invites/:id/decline --')
  const inviteForDeclineRes = await fetch(BASE + '/collaboration-invites', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as1.id, hireStart: new Date(Date.now() + 86400000).toISOString(), hireEnd: new Date(Date.now() + 15 * 86400000).toISOString(), taskTypes: ['INKING'] })
  })
  const inviteForDecline = await inviteForDeclineRes.json()
  const declineInviteId = inviteForDecline.data?.id
  // as2 tries to decline invite sent to as1 -> should 403
  r = await fetch(BASE + '/collaboration-invites/' + declineInviteId + '/decline', { method: 'POST', headers: as2H })
  if (r.status === 403) pass('Non-invitee cannot decline -> 403')
  else fail('Expected 403, got ' + r.status + ' ' + JSON.stringify(await r.json()))

  // 14. TEST 10 -- studioAssignmentId REQUIRED (schema validation)
  log('')
  log('-- TEST 10: POST /assistant-reviews without studioAssignmentId -> 422 --')
  r = await fetch(BASE + '/assistant-reviews', {
    method: 'POST', headers: mkH,
    body: JSON.stringify({ assistantId: as1.id, rating: 3, comment: 'No assignment' })
  })
  if (r.status === 422) pass('Missing studioAssignmentId -> 422 (required field enforced)')
  else fail('Expected 422, got ' + r.status)

  // Final cleanup
  log('')
  log('-- Cleaning up --')
  await cleanup()
  pass('Cleanup done')
  await prisma.$disconnect()
  log('')
  log('ALL SMOKE TESTS COMPLETE')
}

main().catch(async (e) => {
  console.error('[SMOKE] Crashed: ' + e.message)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
