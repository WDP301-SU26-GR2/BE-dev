import { Injectable } from '@nestjs/common'
import {
  REPUTATION_CONFIDENCE,
  REPUTATION_MIN_COUNT,
  REPUTATION_MIN_SCORE,
  REPUTATION_PRIOR_MEAN
} from '../reviews.constant'

export interface ReputationResult {
  ratingAvg: number
  reputationScore: number
  isRecommended: boolean
}

@Injectable()
export class ReputationService {
  // sum = tổng rating, count = số review của target.
  compute(sum: number, count: number): ReputationResult {
    if (count <= 0) return { ratingAvg: 0, reputationScore: 0, isRecommended: false }
    const ratingAvg = round2(sum / count)
    const reputationScore = round2(
      (REPUTATION_CONFIDENCE * REPUTATION_PRIOR_MEAN + sum) / (REPUTATION_CONFIDENCE + count)
    )
    const isRecommended = count >= REPUTATION_MIN_COUNT && reputationScore >= REPUTATION_MIN_SCORE
    return { ratingAvg, reputationScore, isRecommended }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
