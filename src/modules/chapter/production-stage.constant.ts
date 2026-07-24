import { RegionType, Specialization, TaskStatus } from '@prisma/client'

export type StageTemplateItem = {
  order: number
  name: string
  taskTypes: Specialization[]
  isFinalCheck: boolean
}

export const DEFAULT_STAGE_TEMPLATE: StageTemplateItem[] = [
  { order: 1, name: 'INKING', taskTypes: [Specialization.INKING], isFinalCheck: false },
  {
    order: 2,
    name: 'DETAILING',
    taskTypes: [
      Specialization.BACKGROUND,
      Specialization.SCREENTONE,
      Specialization.EFFECT_LINES,
      Specialization.COLORING
    ],
    isFinalCheck: false
  },
  { order: 3, name: 'LETTERING', taskTypes: [Specialization.LETTERING], isFinalCheck: false },
  { order: 4, name: 'FINAL_CHECK', taskTypes: [], isFinalCheck: true }
]

export const STAGE_REGION_HINTS: Record<string, RegionType[]> = {
  INKING: [RegionType.PANEL, RegionType.CHARACTER],
  DETAILING: [RegionType.BACKGROUND, RegionType.PANEL, RegionType.SFX],
  LETTERING: [RegionType.SPEECH_BUBBLE]
}

export const STAGE_OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.ASSIGNED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED,
  TaskStatus.UNDER_REVIEW,
  TaskStatus.REVISION_REQUESTED,
  TaskStatus.ON_HOLD
]
