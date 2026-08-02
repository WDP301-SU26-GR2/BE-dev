// Focused smoke for the 2026-08-01 two-phase publication contract flow.
// Run with the API server up, Mongo and Redis available:
//   pnpm.cmd exec tsx test/flows/smoke-contract-2phase.ts

import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt } from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters } from './lib/http.js'
import { login, seedOtp } from './lib/auth.js'
import {
  BoardDecisionResult,
  BoardSessionStatus,
  ContractStatus,
  ContractType,
  DecisionType,
  SeriesStatus
} from '@prisma/client'

const FLOW = 'smoke-contract-2phase'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  const mangaka = await makeUser('MANGAKA')
  const editor = await makeUser('EDITOR')
  const board = await makeUser('BOARD_MEMBER')
  const outsiderBoard = await makeUser('BOARD_MEMBER')
  const admin = await makeUser('SUPER_ADMIN')

  const mangakaTok = await login(mangaka.email)
  const editorTok = await login(editor.email)
  const boardTok = await login(board.email)
  const outsiderBoardTok = await login(outsiderBoard.email)

  const series = await makeSeriesAt(SeriesStatus.SERIALIZED, {
    mangakaId: mangaka.id,
    editorId: editor.id,
    magazine: '2PHASE Smoke'
  })
  const session = await prisma.boardSession.create({
    data: {
      creatorId: admin.id,
      status: BoardSessionStatus.CONCLUDED,
      allowedEditorIds: [board.id],
      title: `2PHASE Contract Smoke ${Date.now()}`,
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date()
    }
  })
  const decision = await prisma.boardDecision.create({
    data: {
      boardSessionId: session.id,
      targetSeriesId: series.id,
      decisionType: DecisionType.SERIALIZATION,
      result: BoardDecisionResult.APPROVED,
      allowedEditorIds: [board.id],
      totalVotes: 1,
      approveCount: 1,
      rejectCount: 0,
      quorumMet: true
    }
  })

  section('create DRAFT')
  const start = new Date().toISOString()
  const end = new Date(Date.now() + 365 * 86_400_000).toISOString()
  const rCreate = await req('POST', '/contracts', {
    token: editorTok,
    body: {
      seriesId: series.id,
      mangakaId: mangaka.id,
      boardDecisionId: decision.id,
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 2000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: 'compensation:100',
      contractStart: start,
      contractEnd: end
    }
  })
  ok('create contract returns 201', rCreate.status === 201, `got ${rCreate.status} ${rCreate.raw.slice(0, 200)}`)
  const contractId = rCreate.json?.data?.id as string | undefined
  if (!contractId) throw new Error('contract id missing from create response')
  ok(
    'created contract is DRAFT',
    (await prisma.contract.findUnique({ where: { id: contractId } }))?.status === ContractStatus.DRAFT
  )

  section('Board representative review')
  const rSubmit = await req('POST', `/contracts/${contractId}/submit-review`, { token: editorTok })
  ok('submit-review -> BOARD_REVIEW', rSubmit.status === 201, `got ${rSubmit.status} ${rSubmit.raw.slice(0, 200)}`)
  expectError(
    await req('POST', `/contracts/${contractId}/claim`, { token: outsiderBoardTok }),
    403,
    'Error.NotInContractBoardRoster',
    'outsider Board cannot claim'
  )
  const rClaim = await req('POST', `/contracts/${contractId}/claim`, { token: boardTok })
  ok('roster Board claims representative slot', rClaim.status === 201, `got ${rClaim.status}`)
  expectError(
    await req('POST', `/contracts/${contractId}/claim`, { token: boardTok }),
    409,
    'Error.ContractRepresentativeAlreadyClaimed',
    'duplicate claim rejected'
  )
  ok(
    'Board comment accepted',
    (
      await req('POST', `/contracts/${contractId}/comments`, {
        token: boardTok,
        body: { content: 'Ready for Mangaka signature.' }
      })
    ).status === 201
  )

  section('Representative signs then Mangaka signs')
  await seedOtp(board.email, 'SIGNING_CONTRACT')
  const rRepSign = await req('POST', `/contracts/${contractId}/sign-representative`, {
    token: boardTok,
    body: { otpCode: '123456' }
  })
  ok('representative sign -> AWAITING_MANGAKA', rRepSign.status === 201, `got ${rRepSign.status}`)
  ok(
    'DB status AWAITING_MANGAKA',
    (await prisma.contract.findUnique({ where: { id: contractId } }))?.status === ContractStatus.AWAITING_MANGAKA
  )
  await seedOtp(mangaka.email, 'SIGNING_CONTRACT')
  const rMangakaSign = await req('POST', `/contracts/${contractId}/sign-mangaka`, {
    token: mangakaTok,
    body: { otpCode: '123456' }
  })
  ok('mangaka sign -> FULLY_EXECUTED', rMangakaSign.status === 201, `got ${rMangakaSign.status}`)
  ok(
    'DB status FULLY_EXECUTED',
    (await prisma.contract.findUnique({ where: { id: contractId } }))?.status === ContractStatus.FULLY_EXECUTED
  )

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
