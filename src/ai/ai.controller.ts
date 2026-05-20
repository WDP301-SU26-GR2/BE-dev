import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { GenerateStorylineDto } from './dto/generate-storyline.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('storyline-idea')
  @ApiOperation({
    summary:
      'Generate manga storyline idea using AI or local template fallback',
  })
  generateStorylineIdea(@Body() input: GenerateStorylineDto) {
    return this.aiService.generateStorylineIdea(input);
  }
}
