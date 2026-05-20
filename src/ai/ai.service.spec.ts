import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

describe('AiService', () => {
  it('uses template fallback when OPENAI_API_KEY is missing', async () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const service = new AiService(configService);

    await expect(
      service.generateStorylineIdea({
        prompt: 'A beginner mangaka chases a serialization dream.',
        tone: 'hopeful',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        source: 'template',
      }),
    );
  });
});
