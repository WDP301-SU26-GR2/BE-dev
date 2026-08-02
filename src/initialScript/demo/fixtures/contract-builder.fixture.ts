import {
  BoardDecisionResult,
  BoardSessionPhase,
  BoardSessionStatus,
  ConditionType,
  ContractStatus,
  ContractType,
  DecisionType,
  PaymentConditionStatus,
  PaymentRecordStatus,
  PaymentSource,
  PaymentType,
  RoleCode,
  VoteValue
} from '@prisma/client'
import { DEMO_ACCOUNTS } from '../demo-data'
import { DAY, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

const FOUNDATION_SESSION_TITLE = '[DEMO FOUNDATION] Serialization approvals for Flow 2-6'
const CONTRACT_REVIEW_SESSION_TITLE = '[DEMO F6] Contract terms approval'

const demoBoardIds = (context: DemoContext) =>
  DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.BOARD_MEMBER).map(
    (account) => requiredAccount(context.accounts, account.alias).id
  )

export const ensureApprovedSerializationDecision = async (context: DemoContext, series: SeriesSeed) => {
  const boardIds = demoBoardIds(context)
  let session = await context.prisma.boardSession.findFirst({ where: { title: FOUNDATION_SESSION_TITLE } })
  if (!session) {
    session = await context.prisma.boardSession.create({
      data: {
        title: FOUNDATION_SESSION_TITLE,
        description: 'Phiên nền đã kết luận; lưu căn cứ Board cho các hợp đồng demo và publish gate.',
        creatorId: series.editorId,
        status: BoardSessionStatus.CONCLUDED,
        phase: BoardSessionPhase.VOTING,
        allowedEditorIds: boardIds,
        startTime: new Date(context.now.getTime() - 90 * DAY),
        endTime: new Date(context.now.getTime() - 89 * DAY)
      }
    })
  }
  const slot = await context.prisma.series.findUnique({
    where: { id: series.id },
    select: { magazine: true, startIssueNumber: true, publicationType: true }
  })
  return context.prisma.boardDecision.create({
    data: {
      targetSeriesId: series.id,
      boardSessionId: session.id,
      decisionType: DecisionType.SERIALIZATION,
      result: BoardDecisionResult.APPROVED,
      totalVotes: boardIds.length,
      approveCount: 4,
      rejectCount: 1,
      quorumMet: true,
      details: {
        magazine: slot?.magazine ?? 'Manga Nexus Weekly',
        startIssueNumber: slot?.startIssueNumber ?? 101,
        publicationType: slot?.publicationType ?? 'WEEKLY',
        note: 'Quyết định serial hoá — căn cứ đối chiếu cho hợp đồng demo.'
      },
      decidedAt: new Date(context.now.getTime() - 89 * DAY),
      allowedEditorIds: boardIds,
      votes: boardIds.map((voterId, index) => ({
        voterId,
        voteValue: index === boardIds.length - 1 ? VoteValue.REJECT : VoteValue.APPROVE,
        note:
          index === boardIds.length - 1
            ? 'Đề nghị theo dõi chặt ba chương đầu.'
            : 'Hồ sơ và bản phác thảo đạt yêu cầu.',
        votedAt: new Date(context.now.getTime() - 89 * DAY)
      }))
    }
  })
}

export const createPendingPublicationContractDecision = async (
  context: DemoContext,
  series: SeriesSeed,
  contractId: string,
  versionId: string
) => {
  const boardIds = demoBoardIds(context)
  let session = await context.prisma.boardSession.findFirst({ where: { title: CONTRACT_REVIEW_SESSION_TITLE } })
  if (!session) {
    session = await context.prisma.boardSession.create({
      data: {
        title: CONTRACT_REVIEW_SESSION_TITLE,
        description:
          'Phiên biểu quyết điều khoản hợp đồng Flow 6. Chỉ áp dụng kết quả sau khi Mangaka duyệt đúng phiên bản.',
        creatorId: series.editorId,
        status: BoardSessionStatus.ACTIVE,
        phase: BoardSessionPhase.VOTING,
        allowedEditorIds: boardIds,
        startTime: new Date(context.now.getTime() - DAY),
        endTime: new Date(context.now.getTime() + 14 * DAY)
      }
    })
  }
  return context.prisma.boardDecision.create({
    data: {
      targetSeriesId: series.id,
      boardSessionId: session.id,
      decisionType: DecisionType.CONTRACT,
      result: BoardDecisionResult.PENDING,
      totalVotes: 0,
      approveCount: 0,
      rejectCount: 0,
      quorumMet: false,
      allowedEditorIds: boardIds,
      details: {
        resourceType: 'PUBLICATION_CONTRACT',
        resourceId: contractId,
        versionId
      }
    }
  })
}

export const createExecutedContract = async (context: DemoContext, series: SeriesSeed) => {
  const decision = await ensureApprovedSerializationDecision(context, series)
  const mangakaSignedAt = new Date(context.now.getTime() - 58 * DAY)
  const boardSignedAt = new Date(context.now.getTime() - 57 * DAY)
  const representativeId = decision.allowedEditorIds[0]
  const contract = await context.prisma.contract.create({
    data: {
      seriesId: series.id,
      mangakaId: series.mangakaId,
      editorId: series.editorId,
      boardDecisionId: decision.id,
      contractType: ContractType.REVENUE_SHARE,
      valuationAmount: 350_000_000,
      publisherOwnershipPct: 70,
      mangakaOwnershipPct: 30,
      terminationClause: JSON.stringify({
        compensationPct: 10,
        policy: 'Các mốc đã đạt vẫn được thanh toán; vi phạm của Mangaka không nhận bồi thường.'
      }),
      contractStart: new Date(context.now.getTime() - 60 * DAY),
      contractEnd: new Date(context.now.getTime() + 720 * DAY),
      status: ContractStatus.FULLY_EXECUTED,
      mangakaSignedAt,
      boardSignedAt,
      representativeId,
      representativeSignedAt: boardSignedAt,
      boardReviewStartedAt: new Date(context.now.getTime() - 58 * DAY)
    }
  })
  await context.prisma.contractVersion.create({
    data: {
      contractId: contract.id,
      versionNumber: 1,
      valuationAmount: contract.valuationAmount,
      publisherOwnershipPct: contract.publisherOwnershipPct,
      mangakaOwnershipPct: contract.mangakaOwnershipPct,
      terminationClause: contract.terminationClause,
      editedById: series.editorId,
      note: 'Bản điều khoản cuối đã được hai phía ký.',
      createdAt: new Date(context.now.getTime() - 59 * DAY)
    }
  })
  const recurring = await context.prisma.paymentCondition.create({
    data: {
      contractId: contract.id,
      conditionType: ConditionType.RECURRING_CHAPTER,
      thresholdConfig: { every: 4 },
      payoutAmount: 25_000_000,
      isRecurring: true,
      status: PaymentConditionStatus.PENDING,
      lastTriggeredValue: 8
    }
  })
  await context.prisma.paymentCondition.create({
    data: {
      contractId: contract.id,
      conditionType: ConditionType.RANKING_MILESTONE,
      thresholdConfig: { topRank: 3 },
      payoutAmount: 40_000_000,
      status: PaymentConditionStatus.PENDING
    }
  })
  for (let milestone = 4; milestone <= 8; milestone += 4) {
    await context.prisma.paymentRecord.create({
      data: {
        contractId: contract.id,
        conditionId: recurring.id,
        receiverId: series.mangakaId,
        seriesId: series.id,
        description: `Thanh toán recurring khi đạt ${milestone} chương`,
        paymentType: PaymentType.RECURRING_CHAPTER,
        paymentSource: PaymentSource.CONTRACT,
        amount: 25_000_000,
        period: `chapter:${milestone}`,
        status: milestone === 4 ? PaymentRecordStatus.PAID : PaymentRecordStatus.APPROVED,
        approvedBy: requiredAccount(context.accounts, 'board.aya').id,
        approvedAt: new Date(context.now.getTime() - (12 - milestone) * DAY),
        paidAt: milestone === 4 ? new Date(context.now.getTime() - 7 * DAY) : null,
        paymentMethod: milestone === 4 ? 'BANK_TRANSFER' : null,
        transactionReference: milestone === 4 ? `DEMO-${series.id.slice(-6)}-CH4` : null,
        createdBy: series.editorId
      }
    })
  }
  return contract
}
