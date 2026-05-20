import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateStorylineDto {
  @ApiProperty({
    example: 'A rookie artist enters a brutal weekly serialization contest.',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({ example: 'inspirational' })
  @IsString()
  @IsNotEmpty()
  tone: string;
}
