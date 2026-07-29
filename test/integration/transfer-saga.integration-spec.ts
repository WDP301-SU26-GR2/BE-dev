import {
  BoardDecisionResult,
  ConditionType,
  ContractStatus,
  DecisionType,
  OutboxEventType,
  PaymentConditionStatus,
  SeriesStatus,
  TransferRequestStatus
} from '@prisma/client'
import { PrismaService } from '../../src/infrastructure/database/prisma.service'
import { DatabaseUnitOfWork } from '../../src/infrastructure/database/database-unit-of-work.service'
import { MongoIndexBootstrapService } from '../../src/infrastructure/database/mongo-index-bootstrap.service'
import { OutboxRepo } from '../../src/infrastructure/database/outbox.repo'
import { ContractRepo } from '../../src/modules/contract/contract.repo'
import { ContractTransferAdapter } from '../../src/modules/contract/adapters/contract-transfer.adapter'
import { ContractWorkflowService } from '../../src/modules/contract/services/contract-workflow.service'
import { PaymentTransferAdapter } from '../../src/modules/payment/adapters/payment-transfer.adapter'
import { PaymentConditionRepo } from '../../src/modules/payment/payment-condition.repo'
import { PaymentConditionStateService } from '../../src/modules/payment/services/payment-condition-state.service'
import { SeriesOwnershipAdapter } from '../../src/modules/series/adapters/series-ownership.adapter'
import { ContractTransferPort } from '../../src/modules/transfer/ports/contract-transfer.port'
import { PaymentTransferPort } from '../../src/modules/transfer/ports/payment-transfer.port'
import { SeriesOwnershipPort } from '../../src/modules/transfer/ports/series-ownership.port'
import { TransferAccessPolicy } from '../../src/modules/transfer/services/transfer-access.policy'
import { TransferContractStateService } from '../../src/modules/transfer/services/transfer-contract-state.service'
import { TransferContractService } from '../../src/modules/transfer/services/transfer-contract.service'
import {
  TransferFinalizerService,
  TransferReplacementPayload
} from '../../src/modules/transfer/services/transfer-finalizer.service'
import { TransferRequestStateService } from '../../src/modules/transfer/services/transfer-request-state.service'
import { TransferResourceLoader } from '../../src/modules/transfer/services/transfer-resource-loader.service'
import { TransferService } from '../../src/modules/transfer/services/transfer.service'
import { TransferTransactionService } from '../../src/modules/transfer/services/transfer-transaction.service'
import { TransferRepo } from '../../src/modules/transfer/transfer.repo'
import { RoleName } from '../../src/core/security/constants/role.constant'

jest.setTimeout(60_000)

type Fixture = Awaited<ReturnType<typeof createFixture>>

const prisma = new PrismaService()
const transferRepo = new TransferRepo(prisma)
const uow = new DatabaseUnitOfWork(prisma)
const requestState = new TransferRequestStateService(transferRepo)
const contractState = new TransferContractStateService(transferRepo)
const outbox = new OutboxRepo(prisma)
const contractRepo = new ContractRepo(prisma, outbox)
const contractWorkflow = new ContractWorkflowService(
  contractRepo,
  { notifySafe: jest.fn() } as never,
  { record: jest.fn() } as never
)
const contractAdapter = new ContractTransferAdapter(contractWorkflow)
const paymentConditionState = new PaymentConditionStateService(new PaymentConditionRepo(prisma), {
  record: jest.fn()
} as never)
const paymentAdapter = new PaymentTransferAdapter(paymentConditionState)
const seriesAdapter = new SeriesOwnershipAdapter()

let roleId = ''
let sequence = 0

const cleanupData = async () => {
  const [series, boardSessions] = await Promise.all([
    prisma.series.findMany({
      where: { title: { startsWith: 'Transfer integration ' } },
      select: { id: true }
    }),
    prisma.boardSession.findMany({
      where: { title: { startsWith: 'Transfer decision ' } },
      select: { id: true }
    })
  ])
  const seriesIds = series.map(({ id }) => id)
  const boardSessionIds = boardSessions.map(({ id }) => id)

  const [transferRequests, transferContracts, contracts, boardDecisions] = await Promise.all([
    prisma.transferRequest.findMany({
      where: { seriesId: { in: seriesIds } },
      select: { id: true }
    }),
    prisma.transferContract.findMany({
      where: { seriesId: { in: seriesIds } },
      select: { id: true }
    }),
    prisma.contract.findMany({
      where: { seriesId: { in: seriesIds } },
      select: { id: true }
    }),
    prisma.boardDecision.findMany({
      where: {
        OR: [{ targetSeriesId: { in: seriesIds } }, { boardSessionId: { in: boardSessionIds } }]
      },
      select: { id: true }
    })
  ])
  const transferRequestIds = transferRequests.map(({ id }) => id)
  const transferContractIds = transferContracts.map(({ id }) => id)
  const contractIds = contracts.map(({ id }) => id)
  const boardDecisionIds = boardDecisions.map(({ id }) => id)
  const amendments = await prisma.contractAmendment.findMany({
    where: { contractId: { in: contractIds } },
    select: { id: true }
  })
  const amendmentIds = amendments.map(({ id }) => id)

  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: transferRequestIds } } })
  await prisma.contractSignature.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.amendmentSignature.deleteMany({ where: { amendmentId: { in: amendmentIds } } })
  await prisma.contractAmendment.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.contractVersion.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.paymentRecord.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.paymentCondition.deleteMany({ where: { contractId: { in: contractIds } } })
  await prisma.transferContractSignature.deleteMany({
    where: { transferContractId: { in: transferContractIds } }
  })
  await prisma.transferContract.deleteMany({ where: { id: { in: transferContractIds } } })
  await prisma.transferRequest.deleteMany({ where: { id: { in: transferRequestIds } } })
  await prisma.contract.deleteMany({ where: { id: { in: contractIds } } })
  await prisma.seriesReport.deleteMany({ where: { boardDecisionId: { in: boardDecisionIds } } })
  await prisma.boardDecision.deleteMany({ where: { id: { in: boardDecisionIds } } })
  await prisma.boardSession.deleteMany({ where: { id: { in: boardSessionIds } } })
  await prisma.series.deleteMany({ where: { id: { in: seriesIds } } })
  await prisma.user.deleteMany({ where: { roleId } })
}

async function createFixture() {
  const suffix = `${Date.now()}-${++sequence}`
  const createUser = (name: string) =>
    prisma.user.create({
      data: {
        email: `${name}-${suffix}@transfer.integration`,
        name,
        password: 'integration-only',
        phoneNumber: `+849${String(sequence).padStart(8, '0')}`,
        roleId,
        status: 'ACTIVE',
        emailVerified: true
      }
    })

  const [originalMangaka, replacementMangaka, editor, boardMember] = await Promise.all([
    createUser('original'),
    createUser('replacement'),
    createUser('editor'),
    createUser('board')
  ])
  const series = await prisma.series.create({
    data: {
      mangakaId: originalMangaka.id,
      editorId: editor.id,
      title: `Transfer integration ${suffix}`,
      genres: [],
      status: SeriesStatus.SERIALIZED
    }
  })
  const boardSession = await prisma.boardSession.create({
    data: {
      title: `Transfer decision ${suffix}`,
      creatorId: boardMember.id,
      status: 'CONCLUDED',
      phase: 'VOTING',
      allowedEditorIds: [boardMember.id],
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date()
    }
  })
  const boardDecision = await prisma.boardDecision.create({
    data: {
      targetSeriesId: series.id,
      boardSessionId: boardSession.id,
      decisionType: DecisionType.TRANSFER,
      result: BoardDecisionResult.APPROVED,
      totalVotes: 1,
      approveCount: 1,
      quorumMet: true,
      decidedAt: new Date(),
      allowedEditorIds: [boardMember.id]
    }
  })
  const originalContract = await prisma.contract.create({
    data: {
      seriesId: series.id,
      mangakaId: originalMangaka.id,
      editorId: editor.id,
      boardDecisionId: boardDecision.id,
      contractType: 'FULL_BUYOUT',
      status: ContractStatus.FULLY_EXECUTED,
      conditions: {
        create: [
          {
            conditionType: ConditionType.TIME_BOUND,
            payoutAmount: 100,
            status: PaymentConditionStatus.PENDING
          },
          {
            conditionType: ConditionType.CHAPTER_MILESTONE,
            payoutAmount: 200,
            status: PaymentConditionStatus.ACHIEVED
          }
        ]
      }
    }
  })
  const request = await prisma.transferRequest.create({
    data: {
      seriesId: series.id,
      requestingMangakaId: replacementMangaka.id,
      originalMangakaId: originalMangaka.id,
      originalContractType: 'FULL_BUYOUT',
      proposedType: 'FULL_TRANSFER',
      planDescription: 'Integration transfer',
      status: TransferRequestStatus.UNDER_REVIEW,
      boardDecisionId: boardDecision.id,
      originalContractId: originalContract.id
    }
  })
  return {
    originalMangaka,
    replacementMangaka,
    editor,
    boardMember,
    series,
    boardSession,
    boardDecision,
    originalContract,
    request
  }
}

const createReplacement = (fixture: Fixture, status: ContractStatus = ContractStatus.ACTIVATION_PENDING) =>
  prisma.contract.create({
    data: {
      seriesId: fixture.series.id,
      mangakaId: fixture.replacementMangaka.id,
      editorId: fixture.editor.id,
      boardDecisionId: fixture.boardDecision.id,
      sourceTransferRequestId: fixture.request.id,
      contractType: 'FULL_BUYOUT',
      valuationAmount: 1_000,
      status,
      mangakaSignedAt: new Date()
    }
  })

const createOutboxEvent = (fixture: Fixture, replacementContractId: string) => {
  const payload: TransferReplacementPayload = {
    transferRequestId: fixture.request.id,
    originalContractId: fixture.originalContract.id,
    replacementContractId,
    seriesId: fixture.series.id,
    toMangakaId: fixture.replacementMangaka.id
  }
  return prisma.outboxEvent.create({
    data: {
      type: OutboxEventType.TRANSFER_REPLACEMENT_READY,
      aggregateId: fixture.request.id,
      payload
    }
  })
}

const expectPreFinalizationState = async (fixture: Fixture, replacementContractId: string) => {
  const [request, original, replacement, series, conditions, pendingOutbox] = await Promise.all([
    prisma.transferRequest.findUniqueOrThrow({ where: { id: fixture.request.id } }),
    prisma.contract.findUniqueOrThrow({ where: { id: fixture.originalContract.id } }),
    prisma.contract.findUniqueOrThrow({ where: { id: replacementContractId } }),
    prisma.series.findUniqueOrThrow({ where: { id: fixture.series.id } }),
    prisma.paymentCondition.findMany({
      where: { contractId: fixture.originalContract.id },
      orderBy: { payoutAmount: 'asc' }
    }),
    prisma.outboxEvent.count({
      where: { aggregateId: fixture.request.id, processedAt: { isSet: false } }
    })
  ])

  expect(request.status).toBe(TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES)
  expect(original.status).toBe(ContractStatus.FULLY_EXECUTED)
  expect(replacement.status).toBe(ContractStatus.ACTIVATION_PENDING)
  expect(series.mangakaId).toBe(fixture.originalMangaka.id)
  expect(conditions.map((condition) => condition.status)).toEqual([
    PaymentConditionStatus.PENDING,
    PaymentConditionStatus.ACHIEVED
  ])
  expect(pendingOutbox).toBe(1)
}

describe('Transfer durable saga on Mongo replica set', () => {
  beforeAll(async () => {
    await prisma.$connect()
    const role = await prisma.role.upsert({
      where: { code: 'TRANSFER_INTEGRATION_TEST' },
      update: {},
      create: { code: 'TRANSFER_INTEGRATION_TEST', description: 'Isolated transfer integration fixtures' }
    })
    roleId = role.id

    const bootstrapFixture = await createFixture()
    const temporaryTransferContract = await prisma.transferContract.create({
      data: {
        transferRequestId: bootstrapFixture.request.id,
        seriesId: bootstrapFixture.series.id,
        fromMangakaId: bootstrapFixture.originalMangaka.id,
        toMangakaId: bootstrapFixture.replacementMangaka.id,
        transferType: 'FULL_TRANSFER',
        transferAmount: 1,
        newOwnershipSplit: { replacement: 100 }
      }
    })
    await new MongoIndexBootstrapService(prisma).ensureTransferIndexes()
    await prisma.transferContract.delete({ where: { id: temporaryTransferContract.id } })
    await cleanupData()
  })

  afterEach(cleanupData)

  afterAll(async () => {
    await cleanupData()
    await prisma.role.deleteMany({ where: { id: roleId } })
    await prisma.$disconnect()
  })

  it('admits one request-state CAS winner and rejects the stale concurrent transition', async () => {
    const fixture = await createFixture()

    const results = await Promise.allSettled([
      uow.runInTransaction((context) =>
        requestState.transition(
          context,
          fixture.request.id,
          TransferRequestStatus.UNDER_REVIEW,
          TransferRequestStatus.NEGOTIATING
        )
      ),
      uow.runInTransaction((context) =>
        requestState.transition(
          context,
          fixture.request.id,
          TransferRequestStatus.UNDER_REVIEW,
          TransferRequestStatus.NEGOTIATING
        )
      )
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await prisma.transferRequest.findUniqueOrThrow({ where: { id: fixture.request.id } })).status).toBe(
      TransferRequestStatus.NEGOTIATING
    )
  })

  it('rolls a request-state transition back when its transaction fails after the CAS', async () => {
    const fixture = await createFixture()

    await expect(
      uow.runInTransaction(async (context) => {
        await requestState.transition(
          context,
          fixture.request.id,
          TransferRequestStatus.UNDER_REVIEW,
          TransferRequestStatus.NEGOTIATING
        )
        throw new Error('INJECTED_AFTER_REQUEST_CAS')
      })
    ).rejects.toThrow('INJECTED_AFTER_REQUEST_CAS')

    expect((await prisma.transferRequest.findUniqueOrThrow({ where: { id: fixture.request.id } })).status).toBe(
      TransferRequestStatus.UNDER_REVIEW
    )
  })

  it('keeps the old contract active until finalization and admits one of 10 concurrent assignments', async () => {
    const fixture = await createFixture()
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const board = {
      getTransferDecisionContext: jest.fn().mockResolvedValue({
        id: fixture.boardDecision.id,
        boardSessionId: fixture.boardSession.id,
        targetSeriesId: fixture.series.id,
        decisionType: DecisionType.TRANSFER,
        result: BoardDecisionResult.APPROVED,
        allowedEditorIds: [fixture.boardMember.id]
      })
    }
    const policy = new TransferAccessPolicy()
    const loader = new TransferResourceLoader(transferRepo, board as never, policy)
    const transactions = new TransferTransactionService(
      uow,
      contractAdapter,
      seriesAdapter,
      {} as never,
      requestState,
      contractState
    )
    const service = new TransferService(
      {} as never,
      {} as never,
      new TransferContractService(transferRepo, audit as never, policy, loader, transactions, {
        notifySafe: jest.fn()
      } as never),
      {} as never,
      {} as never
    )
    const actor = { userId: fixture.boardMember.id, roleName: RoleName.BOARD_MEMBER }
    const command = {
      valuationAmount: 1_000,
      conditions: [{ description: 'Settlement', type: ConditionType.TIME_BOUND, value: 100 }]
    }

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.boardAssignFullBuyout(fixture.request.id, actor, command))
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const replacements = await prisma.contract.findMany({
      where: { sourceTransferRequestId: fixture.request.id }
    })
    expect(replacements).toHaveLength(1)
    expect(replacements[0].status).toBe(ContractStatus.DRAFT)
    expect((await prisma.transferRequest.findUniqueOrThrow({ where: { id: fixture.request.id } })).status).toBe(
      TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES
    )
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: fixture.originalContract.id } })).status).toBe(
      ContractStatus.FULLY_EXECUTED
    )
    expect((await prisma.series.findUniqueOrThrow({ where: { id: fixture.series.id } })).mangakaId).toBe(
      fixture.originalMangaka.id
    )
    expect(audit.record).toHaveBeenCalledTimes(1)
  })

  it('creates one ACTIVATION_PENDING state and one outbox event under a final-signature race', async () => {
    const fixture = await createFixture()
    await prisma.transferRequest.update({
      where: { id: fixture.request.id },
      data: { status: TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES }
    })
    const replacement = await createReplacement(fixture, ContractStatus.BOARD_APPROVED)
    const contractRepo = new ContractRepo(prisma, outbox)

    const results = await Promise.allSettled([
      contractRepo.recordBoardSignatureAndSettle(replacement.id, fixture.boardMember.id, 1),
      contractRepo.recordBoardSignatureAndSettle(replacement.id, fixture.boardMember.id, 1)
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: replacement.id } })).status).toBe(
      ContractStatus.ACTIVATION_PENDING
    )
    expect(await prisma.contractSignature.count({ where: { contractId: replacement.id } })).toBe(1)
    expect(
      await prisma.outboxEvent.count({
        where: { type: OutboxEventType.TRANSFER_REPLACEMENT_READY, aggregateId: fixture.request.id }
      })
    ).toBe(1)
  })

  it.each(['contract', 'payment', 'series'] as const)(
    'rolls every authoritative write back when failure is injected after the %s step',
    async (failureStep) => {
      const fixture = await createFixture()
      await prisma.transferRequest.update({
        where: { id: fixture.request.id },
        data: { status: TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES }
      })
      const replacement = await createReplacement(fixture)
      const event = await createOutboxEvent(fixture, replacement.id)

      const contracts: ContractTransferPort = {
        createReplacementDraft: (...args) => contractAdapter.createReplacementDraft(...args),
        activateReplacementAndTerminateOriginal: async (...args) => {
          await contractAdapter.activateReplacementAndTerminateOriginal(...args)
          if (failureStep === 'contract') throw new Error('INJECTED_AFTER_CONTRACT')
        }
      }
      const payments: PaymentTransferPort = {
        markPendingConditionsMissed: async (...args) => {
          await paymentAdapter.markPendingConditionsMissed(...args)
          if (failureStep === 'payment') throw new Error('INJECTED_AFTER_PAYMENT')
        }
      }
      const series: SeriesOwnershipPort = {
        transferOwnership: async (...args) => {
          await seriesAdapter.transferOwnership(...args)
          if (failureStep === 'series') throw new Error('INJECTED_AFTER_SERIES')
        }
      }
      const effects = { publish: jest.fn(), acknowledge: (id: string) => outbox.markProcessed(id) }
      const finalizer = new TransferFinalizerService(uow, requestState, contracts, payments, series, effects as never)

      await expect(finalizer.finalize(event)).rejects.toThrow(`INJECTED_AFTER_${failureStep.toUpperCase()}`)
      await expectPreFinalizationState(fixture, replacement.id)
    }
  )

  it('settles once when finalizers race and leaves the outbox retry idempotent', async () => {
    const fixture = await createFixture()
    await prisma.transferRequest.update({
      where: { id: fixture.request.id },
      data: { status: TransferRequestStatus.AWAITING_REPLACEMENT_SIGNATURES }
    })
    const replacement = await createReplacement(fixture)
    const event = await createOutboxEvent(fixture, replacement.id)
    const effects = { publish: jest.fn(), acknowledge: (id: string) => outbox.markProcessed(id) }
    const finalizer = new TransferFinalizerService(
      uow,
      requestState,
      contractAdapter,
      paymentAdapter,
      seriesAdapter,
      effects as never
    )

    const results = await Promise.allSettled([finalizer.finalize(event), finalizer.finalize(event)])
    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)
    await finalizer.finalize(event)

    const [request, original, activeReplacement, series, conditions, storedEvent] = await Promise.all([
      prisma.transferRequest.findUniqueOrThrow({ where: { id: fixture.request.id } }),
      prisma.contract.findUniqueOrThrow({ where: { id: fixture.originalContract.id } }),
      prisma.contract.findUniqueOrThrow({ where: { id: replacement.id } }),
      prisma.series.findUniqueOrThrow({ where: { id: fixture.series.id } }),
      prisma.paymentCondition.findMany({
        where: { contractId: fixture.originalContract.id },
        orderBy: { payoutAmount: 'asc' }
      }),
      prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })
    ])
    expect(request.status).toBe(TransferRequestStatus.COMPLETED)
    expect(original.status).toBe(ContractStatus.TERMINATED)
    expect(activeReplacement.status).toBe(ContractStatus.FULLY_EXECUTED)
    expect(series.mangakaId).toBe(fixture.replacementMangaka.id)
    expect(conditions.map((condition) => condition.status)).toEqual([
      PaymentConditionStatus.MISSED,
      PaymentConditionStatus.ACHIEVED
    ])
    expect(storedEvent.processedAt).toBeInstanceOf(Date)
    expect(effects.publish).toHaveBeenCalledTimes(1)
    expect(
      await prisma.contract.count({ where: { seriesId: fixture.series.id, status: ContractStatus.FULLY_EXECUTED } })
    ).toBe(1)
  })
})
