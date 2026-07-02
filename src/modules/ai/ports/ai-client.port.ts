import { AiSegmentMode } from '@prisma/client'
import { AiSegmentResponseType } from '../schemas/ai-schemas'

export interface AiSegmentInput {
  imageUrl: string
  mode: AiSegmentMode
}

export abstract class AiClientPort {
  abstract segment(input: AiSegmentInput): Promise<AiSegmentResponseType>
}
