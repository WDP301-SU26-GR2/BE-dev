import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateStorylineDto } from './dto/generate-storyline.dto';

@Injectable()
export class AiService {
  private readonly client?: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async generateStorylineIdea(
    input: GenerateStorylineDto,
  ): Promise<{ suggestion: string; source: 'openai' | 'template' }> {
    if (!this.client) {
      return {
        suggestion: `Tone: ${input.tone}. Core idea: ${input.prompt}. Add a conflict, a mentor, and a publication deadline to shape a 3-act manga arc.`,
        source: 'template',
      };
    }

    const completion = await this.client.responses.create({
      model: 'gpt-4.1-mini',
      input: `Create a concise manga storyline idea with tone "${input.tone}" based on: ${input.prompt}`,
      max_output_tokens: 200,
    });

    return {
      suggestion: completion.output_text.trim(),
      source: 'openai',
    };
  }
}
