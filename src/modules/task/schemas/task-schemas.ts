import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { UserMiniSchema } from 'src/core/models/user-mini.model'

const CoordinatesSchema = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive()
  })
  .describe('Toạ độ vùng trên trang (pixel, top-left origin; x,y ≥ 0; width,height > 0)')

// ---- Region (A-TSK-01/02) ----
export const CreateRegionBodySchema = extendApi(
  z
    .object({
      coordinates: CoordinatesSchema,
      regionType: zEnum($Enums.RegionType, 'RegionType').optional()
    })
    .strict(),
  { title: 'CreateRegionBody', description: 'Mangaka khoanh vùng manual trên trang' }
)

export const UpdateRegionBodySchema = extendApi(
  z
    .object({
      coordinates: CoordinatesSchema.nullish(),
      regionType: zEnum($Enums.RegionType, 'RegionType').nullish(),
      confirmedByMangaka: z.boolean().nullish()
    })
    .strict(),
  { title: 'UpdateRegionBody', description: 'Sửa vùng (partial: omit/null = giữ nguyên)' }
)

export const RegionResSchema = extendApi(
  z.object({
    id: z.string(),
    pageId: z.string(),
    coordinates: CoordinatesSchema.nullable(),
    regionType: zEnum($Enums.RegionType, 'RegionType').nullable(),
    createdBy: z.string().nullable().describe('MANUAL | AI'),
    confirmedByMangaka: z.boolean(),
    confidenceScore: z.number().nullable().describe('null khi MANUAL'),
    detectedSubtype: z.string().nullable().describe('Original AI model class (frame/body/text-block/bubble/...)'),
    aiModelVersion: z.string().nullable().describe('AI model version that produced this region; null for MANUAL')
  }),
  { title: 'RegionRes', description: 'Một vùng trên trang' }
)

export const RegionListResSchema = extendApi(z.object({ items: z.array(RegionResSchema) }), {
  title: 'RegionListRes',
  description: 'Danh sách vùng của 1 trang'
})

export const DeleteRegionResSchema = extendApi(
  z.object({
    regionId: z.string(),
    cancelledTaskIds: z.array(z.string()).describe('Task ids cascaded to CANCELLED')
  }),
  { title: 'DeleteRegionRes', description: 'Region delete result with cascaded task cancellation' }
)

// ---- Task (A-TSK-03/04/09) ----
// POST /tasks: MỘT task gắn với MỘT trang, chọn 0..N vùng (region) trên trang đó.
export const CreateTaskBodySchema = extendApi(
  z
    .object({
      pageId: z.string(),
      regionIds: z
        .array(z.string())
        .max(50)
        .default([])
        .describe('Các vùng trên trang cần xử lý (đều phải thuộc pageId); rỗng = giao cả trang'),
      assistantId: z.string(),
      taskType: zEnum($Enums.Specialization, 'Specialization'),
      deadline: z.string().datetime({ offset: true }).optional(),
      priority: z.number().int().nonnegative().default(0),
      assetIds: z.array(z.string()).default([])
    })
    .strict(),
  { title: 'CreateTaskBody', description: 'Giao 1 task cho Assistant trên 1 trang (0..N vùng) — enforce BR-ASSIST-01' }
)

// Item của batch: MỖI task 1 vùng (giữ nguyên contract cũ để không breaking `POST /tasks/batch`).
export const BatchTaskItemSchema = extendApi(
  z
    .object({
      pageId: z.string(),
      regionId: z.string().optional(),
      assistantId: z.string(),
      taskType: zEnum($Enums.Specialization, 'Specialization'),
      deadline: z.string().datetime({ offset: true }).optional(),
      priority: z.number().int().nonnegative().default(0),
      assetIds: z.array(z.string()).default([])
    })
    .strict(),
  { title: 'BatchTaskItem', description: 'Một task trong batch (1 vùng)' }
)

export const BatchCreateTaskBodySchema = extendApi(
  z.object({ items: z.array(BatchTaskItemSchema).min(1).max(50) }).strict(),
  { title: 'BatchCreateTaskBody', description: 'Giao nhiều task (all-or-nothing)' }
)

export const CreateTaskGroupBodySchema = extendApi(
  z
    .object({
      pageIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'pageId không hợp lệ'))
        .min(1)
        .max(50)
        .describe('Các trang cùng nhận một đầu việc (tối đa 50) — all-or-nothing'),
      assistantId: z.string(),
      taskType: zEnum($Enums.Specialization, 'Specialization'),
      groupTitle: z.string().min(1).max(200).optional().describe('Tên nhóm việc hiển thị, vd "Vẽ nền ch.5"'),
      deadline: z.string().datetime({ offset: true }).optional(),
      priority: z.number().int().nonnegative().default(0),
      assetIds: z.array(z.string()).default([])
    })
    .strict(),
  {
    title: 'CreateTaskGroupBody',
    description:
      'Giao một đầu việc trải nhiều trang. Backend tạo N task (mỗi trang 1 task) dùng chung groupId — ' +
      'giữ nguyên cơ chế region/tiến độ/duyệt theo trang.'
  }
)

export const UpdateTaskBodySchema = extendApi(
  z
    .object({
      assetIds: z.array(z.string()).nullish().describe('[] = clear; omit/null = giữ nguyên'),
      deadline: z.string().datetime({ offset: true }).nullish(),
      priority: z.number().int().nonnegative().nullish()
    })
    .strict(),
  { title: 'UpdateTaskBody', description: 'Sửa task (partial)' }
)

export const SubmitTaskBodySchema = extendApi(z.object({ file: z.string().min(1) }).strict(), {
  title: 'SubmitTaskBody',
  description: 'Assistant nộp kết quả (object key R2)'
})

export const TaskFileDownloadBodySchema = extendApi(z.object({ key: z.string().min(1) }).strict(), {
  title: 'TaskFileDownloadBody',
  description: 'Object key cần tải — phải thuộc task (ảnh gốc/composite trang hoặc file version); khác → 403'
})

export const TaskFileDownloadResSchema = extendApi(
  z.object({
    downloadUrl: z.string().describe('Presigned GET URL có hạn'),
    expiresAt: z.string().describe('ISO 8601 thời điểm hết hạn')
  }),
  { title: 'TaskFileDownloadRes', description: 'Presigned download cho file của task' }
)

export const RequestRevisionBodySchema = extendApi(z.object({ reviewerNote: z.string().min(1).max(1000) }).strict(), {
  title: 'RequestRevisionBody',
  description: 'Mangaka yêu cầu sửa (markup tạo riêng qua POST /annotations)'
})

export const ReassignTaskBodySchema = extendApi(z.object({ assistantId: z.string() }).strict(), {
  title: 'ReassignTaskBody',
  description: 'Giao lại task ON_HOLD cho Assistant khác'
})

export const CancelTaskBodySchema = extendApi(z.object({ reason: z.string().min(1).optional() }).strict(), {
  title: 'CancelTaskBody',
  description: 'Mangaka cancels a task that is not APPROVED/CANCELLED'
})

export const TaskVersionResSchema = z.object({
  submittedBy: z.string().nullable(),
  versionNumber: z.number(),
  file: z.string().nullable(),
  reviewStatus: zEnum($Enums.TaskVersionReviewStatus, 'TaskVersionReviewStatus'),
  reviewerNote: z.string().nullable(),
  submittedAt: z.string(),
  submitter: UserMiniSchema.nullable().optional().describe('Người nộp phiên bản — có ở GET list/detail')
})

export const TaskResSchema = extendApi(
  z.object({
    id: z.string(),
    pageId: z.string(),
    regionIds: z.array(z.string()).describe('Các vùng (Region id) mà task này xử lý; rỗng = cả trang / task nhóm'),
    assistantId: z.string().nullable(),
    taskType: zEnum($Enums.Specialization, 'Specialization').nullable(),
    status: zEnum($Enums.TaskStatus, 'TaskStatus'),
    statusReason: z.string().nullable().describe('Latest status-change reason for cancel/reassign'),
    priority: z.number(),
    deadline: z.string().nullable(),
    assetIds: z.array(z.string()),
    versions: z.array(TaskVersionResSchema),
    createdAt: z.string(),
    groupId: z.string().nullable().optional().describe('Nhóm việc chứa task này; null = task lẻ'),
    groupTitle: z.string().nullable().optional().describe('Tên nhóm việc hiển thị'),
    assistant: UserMiniSchema.nullable().optional().describe('Trợ lý được giao — có ở GET list/detail'),
    assets: z
      .array(
        z.object({
          id: z.string().describe('ObjectId Asset (= một phần tử của assetIds)'),
          filePath: z.string().describe('Object key R2 — truyền vào POST /tasks/:id/download-url để tải reference'),
          name: z.string(),
          assetType: zEnum($Enums.AssetType, 'AssetType').nullable()
        })
      )
      .optional()
      .describe('Ảnh reference Mangaka đính khi giao task (resolve từ assetIds → key) — có ở GET list/detail'),
    regions: z
      .array(RegionResSchema)
      .optional()
      .describe(
        'Các vùng cần xử lý (toạ độ + loại vùng) — có ở GET list/detail. ' +
          'Task 1 trang trả đủ vùng; task nhóm (nhiều trang) trả [] (chỉ hiển thị theo trang).'
      ),
    pageOriginalFile: z
      .string()
      .nullable()
      .optional()
      .describe('Object key ảnh GỐC của trang (bản Mangaka giao) — dùng ký signed URL để review; có ở GET list/detail'),
    pageDisplayFile: z
      .string()
      .nullable()
      .optional()
      .describe('Object key ảnh NÊN HIỂN THỊ của trang = compositeFile ?? originalFile; có ở GET list/detail')
  }),
  { title: 'TaskRes', description: 'Một task production' }
)

export const TaskGroupResSchema = extendApi(
  z.object({
    groupId: z.string(),
    groupTitle: z.string().nullable(),
    items: z.array(TaskResSchema),
    total: z.number()
  }),
  { title: 'TaskGroupRes', description: 'Nhóm việc vừa tạo' }
)

export const ApproveTaskGroupResSchema = extendApi(
  z.object({
    groupId: z.string(),
    approved: z.number().describe('Số task vừa được duyệt'),
    skipped: z.array(z.string()).describe('Task id bỏ qua vì chưa ở trạng thái duyệt được')
  }),
  { title: 'ApproveTaskGroupRes', description: 'Kết quả duyệt cả nhóm' }
)

export const TaskListResSchema = extendApi(
  z.object({ items: z.array(TaskResSchema), total: z.number(), limit: z.number(), offset: z.number() }),
  { title: 'TaskListRes', description: 'Danh sách task phân trang' }
)

export const ListTasksQuerySchema = extendApi(
  z
    .object({
      seriesId: z.string().optional().describe('Lọc task theo series (Mangaka: chỉ series mình sở hữu)'),
      chapterId: z.string().optional().describe('Lọc task theo chapter'),
      pageId: z.string().optional(),
      regionId: z.string().optional().describe('Lọc task theo vùng (Region id)'),
      groupId: z.string().optional().describe('Lọc task theo nhóm việc (task group)'),
      assistantId: z.string().optional(),
      status: zEnum($Enums.TaskStatus, 'TaskStatus').optional(),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  {
    title: 'ListTasksQuery',
    description:
      'Lọc task (scope theo role). Mangaka KHÔNG cần truyền pageId — mặc định là toàn bộ task thuộc series mình sở hữu, rồi lọc dần theo assistantId/seriesId/chapterId/pageId.'
  }
)

export type CreateRegionBodyType = z.infer<typeof CreateRegionBodySchema>
export type UpdateRegionBodyType = z.infer<typeof UpdateRegionBodySchema>
export type DeleteRegionResType = z.infer<typeof DeleteRegionResSchema>
export type CreateTaskBodyType = z.infer<typeof CreateTaskBodySchema>
export type BatchTaskItemType = z.infer<typeof BatchTaskItemSchema>
export type BatchCreateTaskBodyType = z.infer<typeof BatchCreateTaskBodySchema>
export type UpdateTaskBodyType = z.infer<typeof UpdateTaskBodySchema>
export type SubmitTaskBodyType = z.infer<typeof SubmitTaskBodySchema>
export type RequestRevisionBodyType = z.infer<typeof RequestRevisionBodySchema>
export type ReassignTaskBodyType = z.infer<typeof ReassignTaskBodySchema>
export type CancelTaskBodyType = z.infer<typeof CancelTaskBodySchema>
export type CreateTaskGroupBodyType = z.infer<typeof CreateTaskGroupBodySchema>
export type ListTasksQueryType = z.infer<typeof ListTasksQuerySchema>
