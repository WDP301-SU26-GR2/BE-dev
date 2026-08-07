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
      description:
        'Phiên ACTIVE/VOTING để demo quyết định giữ series bằng reject CANCELLATION, đổi format, huỷ hoặc hoàn tất tự nhiên.',
      creatorId: editor.id,
      status: BoardSessionStatus.ACTIVE,
      phase: BoardSessionPhase.VOTING,
      allowedEditorIds: boardIds,
      startTime: new Date(context.now.getTime() - 2 * 3_600_000),
      endTime: new Date(context.now.getTime() + 5 * DAY)
    }
  })

  for (const [index, target] of targets.entries()) {
    const decisionType = [DecisionType.CANCELLATION, DecisionType.FORMAT_CHANGE, DecisionType.COMPLETION][index % 3]
    const isCancellation = decisionType === DecisionType.CANCELLATION
    const isFormatChange = decisionType === DecisionType.FORMAT_CHANGE
    const decision = await context.prisma.boardDecision.create({
      data: {
        targetSeriesId: target.id,
        boardSessionId: session.id,
        decisionType,
        result: BoardDecisionResult.PENDING,
        totalVotes: 0,
        approveCount: 0,
        rejectCount: 0,
        quorumMet: false,
        endingChapterAllowance: isCancellation ? 3 : null,
        details: {
          demoRun: index + 1,
          reason: isCancellation
            ? 'Bottom 1/3 liên tục; Board cân nhắc huỷ sau ba chương kết.'
            : isFormatChange
              ? 'Giảm tần suất để cải thiện chất lượng và ổn định tiến độ.'
              : 'Mangaka và Editor đề xuất khép lại arc cuối theo kế hoạch tự nhiên.',
          publicationType: isFormatChange ? 'MONTHLY' : null
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
        content: isCancellation
          ? 'Ranking giảm liên tục. Báo cáo nêu phương án kết thúc trong ba chương và nghĩa vụ thanh toán còn lại.'
          : isFormatChange
            ? 'Đề xuất chuyển Weekly sang Monthly từ chapter kế tiếp, không hồi tố deadline chapter đang sản xuất.'
            : 'Mangaka đã hoàn tất arc chính; đề xuất chapter cuối dài hơn và kế hoạch thay thế slot sau khi hoàn tất.',
        attachments: [requiredMedia(context.media, 'three-production-versions').key]
      }
    })
  }
}
