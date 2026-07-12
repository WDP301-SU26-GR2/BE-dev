/**
 * Cross-cutting WS tests.
 *
 * Bao phủ:
 * - WS1: No-token connection → server disconnects (sau joinSession thì mới reject)
 * - WS2: Bad-token → similar
 * - WS3: Valid token + valid board session → joinSession SUCCESS
 * - WS4: Valid token + invalid ObjectId → DENIED
 * - WS5: Valid token + session không invited this editor → DENIED
 * - WS6: voteProgressUpdated event broadcast sau khi vote
 *
 * Dùng `connectBoard`, `waitConnected`, `joinSession`, `waitForEvent` từ `lib/ws.ts`.
 */

import { wipeDb, seedRolesAndAdmin, makeUser, makeBoardSession, makeBoardDecision, prisma } from './lib/seed.js'
import { ok, section, summary, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import { connectBoard, waitConnected, joinSession, waitForEvent } from './lib/ws.js'
import { BoardSessionStatus, DecisionType, RoleCode } from '@prisma/client'

const FLOW = 'cross-ws'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  section('WS1 no-token rejects')
  {
    const s1 = connectBoard()
    const r = await waitConnected(s1, 5000)
    // Note: Socket.io `connect` event fires on TCP handshake, BEFORE server runs handleConnection.
    // Server disconnects async after auth fails (subsequent 'disconnect' event). Some WS libs
    // only emit `connect` once. To properly validate, we listen for `disconnect` event after.
    let disconnected = false
    s1.on('disconnect', () => {
      disconnected = true
    })
    await sleep(1500)
    ok(
      'WS1.1 connect (no-token) → server disconnect',
      disconnected === true || r.connected === false,
      `connected=${r.connected} disconnected=${disconnected}`
    )
    s1.disconnect()
    await sleep(200)
  }

  section('WS2 bad-token rejects')
  {
    const s1 = connectBoard('garbage.jwt.token.12345')
    const r = await waitConnected(s1, 5000)
    let disconnected = false
    s1.on('disconnect', () => {
      disconnected = true
    })
    await sleep(1500)
    ok(
      'WS2.1 connect (bad-token)',
      disconnected === true || r.connected === false,
      `connected=${r.connected} disconnected=${disconnected}`
    )
    s1.disconnect()
    await sleep(200)
  }

  section('WS3 valid token + valid session → SUCCESS')
  {
    const e1 = await makeUser('EDITOR')
    const b1 = await makeUser('BOARD_MEMBER')
    const b1Tok = await login(b1.email)

    const session = await makeBoardSession({
      creatorId: e1.id,
      allowedEditorIds: [b1.id, e1.id],
      status: BoardSessionStatus.ACTIVE,
      title: 'WS test session',
      startTime: new Date(Date.now() - 10_000),
      endTime: null
    })

    const sock = connectBoard(b1Tok)
    const c = await waitConnected(sock, 3000)
    if (c.connected) {
      const join = await joinSession(sock, session.id, 3000)
      ok('WS3.1 join valid session SUCCESS', join.status === 'SUCCESS', `got ${join.status} ${join.message ?? ''}`)
    } else {
      ok('WS3.1 connect valid token', false, `connect failed: ${c.error ?? 'unknown'}`)
    }
    sock.disconnect()
    await sleep(200)
  }

  section('WS4 invalid sessionId → DENIED')
  {
    const b1 = await makeUser(RoleCode.BOARD_MEMBER)
    const b1Tok = await login(b1.email)
    const sock = connectBoard(b1Tok)
    const c = await waitConnected(sock, 3000)
    if (c.connected) {
      const join = await joinSession(sock, 'aaaaaaaaaaaaaaaaaaaaaaaa', 3000)
      ok('WS4.1 join non-existent session DENIED', join.status === 'DENIED')
    } else {
      ok('WS4.1 connect', false, c.error ?? 'no connect')
    }
    sock.disconnect()
    await sleep(200)
  }

  section('WS5 session not invited → DENIED')
  {
    const b1 = await makeUser(RoleCode.BOARD_MEMBER)
    const b2 = await makeUser(RoleCode.BOARD_MEMBER)
    const e1 = await makeUser(RoleCode.EDITOR)
    const b2Tok = await login(b2.email)
    const session = await makeBoardSession({
      creatorId: e1.id,
      allowedEditorIds: [b1.id, e1.id],
      status: BoardSessionStatus.ACTIVE,
      startTime: new Date(Date.now() - 10_000)
    })
    const sock = connectBoard(b2Tok)
    const c = await waitConnected(sock, 3000)
    if (c.connected) {
      const join = await joinSession(sock, session.id, 3000)
      ok('WS5.1 join not-invited board session DENIED', join.status === 'DENIED')
    } else {
      ok('WS5.1 connect', false, c.error ?? 'no connect')
    }
    sock.disconnect()
    await sleep(200)
  }

  section('WS6 voteProgressUpdated broadcast after vote')
  {
    const m1 = await makeUser(RoleCode.MANGAKA)
    const e1 = await makeUser(RoleCode.EDITOR)
    const b1 = await makeUser(RoleCode.BOARD_MEMBER)
    const b2 = await makeUser(RoleCode.BOARD_MEMBER)
    const b3 = await makeUser(RoleCode.BOARD_MEMBER)
    const b1Tok = await login(b1.email)

    const session = await makeBoardSession({
      creatorId: e1.id,
      allowedEditorIds: [b1.id, b2.id, b3.id, e1.id],
      status: BoardSessionStatus.ACTIVE,
      startTime: new Date(Date.now() - 10_000)
    })
    const decision = await makeBoardDecision({
      sessionId: session.id,
      targetSeriesId: m1.id,
      decisionType: DecisionType.SERIALIZATION,
      allowedEditorIds: [b1.id, b2.id, b3.id]
    })

    const sock = connectBoard(b1Tok)
    const c = await waitConnected(sock, 3000)
    if (c.connected) {
      const join = await joinSession(sock, session.id, 3000)
      if (join.status === 'SUCCESS') {
        const waitPromise = waitForEvent<unknown>(sock, 'voteProgressUpdated', 5000).catch(() => null)
        // Vote via API
        const { req } = await import('./lib/http.js')
        await req('POST', `/board/decisions/${decision.id}/vote`, {
          token: b1Tok,
          body: { voteValue: 'APPROVE' }
        }).catch(() => null)
        const ev = await waitPromise
        ok('WS6.1 received voteProgressUpdated', ev !== null)
      } else {
        ok('WS6.1 join', false, 'could not join')
      }
    } else {
      ok('WS6.1 connect', false, c.error ?? 'no connect')
    }
    sock.disconnect()
    await sleep(200)
  }

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
