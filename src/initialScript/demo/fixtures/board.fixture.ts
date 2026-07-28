import { BoardDecisionResult, BoardSessionPhase, BoardSessionStatus, DecisionType, RoleCode } from '@prisma/client'
import { DEMO_ACCOUNTS } from '../demo-data'
import { DAY, requiredAccount, requiredMedia } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const seedLifecycleBoard = async (context: DemoContext, targets: SeriesSeed[]) => {
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const boardIds = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.BOARD_MEMBER).map(
    (account) => requiredAccount(context.accounts, account.alias).id
  )
  const session = await context.prisma.boardSession.create({
    data: {
      title: '[DEMO F5] Hội đồng xử lý 10 series nguy cơ',
      description: 'Phiên ACTIVE/VOTING để demo quyết định CONTINUE, CHANGE_FORMAT, CANCEL hoặc COMPLETE.',
      creatorId: editor.id,
      status: BoardSessionStatus.ACTIVE,
      phase: BoardSessionPhase.VOTING,
      allowedEditorIds: boardIds,
      startTime: new Date(context.now.getTime() - 2 * 3_600_000),
      endTime: new Date(context.now.getTime() + 5 * DAY)
    }
  })

  for (const [index, target] of targets.entries()) {
    const decision = await context.prisma.boardDecision.create({
      data: {
        targetSeriesId: target.id,
        boardSessionId: session.id,
        decisionType: index % 2 === 0 ? DecisionType.CANCELLATION : DecisionType.FORMAT_CHANGE,
        result: BoardDecisionResult.PENDING,
        totalVotes: 0,
        approveCount: 0,
        rejectCount: 0,
        quorumMet: false,
        endingChapterAllowance: index % 2 === 0 ? 3 : null,
        details: {
          demoRun: index + 1,
          reason: 'Bottom 1/3 liên tục; xem ranking 14 kỳ và kế hoạch cải thiện.',
          publicationType: index % 2 === 0 ? null : 'MONTHLY'
        },
        allowedEditorIds: boardIds,
        votes: []
      }
    })
    await context.prisma.seriesReport.create({
      data: {
        seriesId: target.id,
        boardDecisionId: decision.id,
        preparedBy: target.editorId,
        reportType: 'DEFENSE',
        content:
          'Ranking giảm do arc chuyển tiếp. Kế hoạch: rút gọn arc hiện tại trong 3 chương, mở arc mới và tăng hoạt động digital.',
        attachments: [requiredMedia(context.media, 'three-production-versions').key]
      }
    })
  }
}
