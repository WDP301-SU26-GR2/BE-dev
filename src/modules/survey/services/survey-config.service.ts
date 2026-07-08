import { Injectable } from '@nestjs/common'
import { VotingConfig } from '@prisma/client'
import { SurveyRepository } from '../survey.repo'

const CACHE_TTL_MS = 30_000

// B-VOT-06: single source cho tham số voting (đọc DB, cache 30s, lazy-seed §1.15, invalidate on PATCH).
// Mirror AppConfigService (PA-10). requestOtp/submitVote đọc từ đây thay SURVEY_CONFIG static cũ.
@Injectable()
export class SurveyConfigService {
  private cached: { row: VotingConfig; expiresAt: number } | null = null

  constructor(private readonly surveyRepository: SurveyRepository) {}

  async get(): Promise<VotingConfig> {
    const now = Date.now()
    if (this.cached && this.cached.expiresAt > now) return this.cached.row
    const row =
      (await this.surveyRepository.getVotingConfig()) ?? (await this.surveyRepository.createDefaultVotingConfig())
    this.cached = { row, expiresAt: now + CACHE_TTL_MS }
    return row
  }

  invalidate(): void {
    this.cached = null
  }
}
