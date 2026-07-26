import { Injectable } from '@nestjs/common'
import { AdminDashboardService } from './admin-dashboard.service'
import { AssistantDashboardService } from './assistant-dashboard.service'
import { BoardDashboardService } from './board-dashboard.service'
import { EditorDashboardService } from './editor-dashboard.service'

@Injectable()
export class AssistantDashboardFacade {
  constructor(private readonly dashboard: AssistantDashboardService) {}

  build(userId: string) {
    return this.dashboard.build(userId)
  }
}

@Injectable()
export class EditorDashboardFacade {
  constructor(private readonly dashboard: EditorDashboardService) {}

  build(userId: string) {
    return this.dashboard.build(userId)
  }
}

@Injectable()
export class BoardDashboardFacade {
  constructor(private readonly dashboard: BoardDashboardService) {}

  build(userId: string) {
    return this.dashboard.build(userId)
  }
}

@Injectable()
export class AdminDashboardFacade {
  constructor(private readonly dashboard: AdminDashboardService) {}

  build(userId: string) {
    return this.dashboard.build(userId)
  }
}
