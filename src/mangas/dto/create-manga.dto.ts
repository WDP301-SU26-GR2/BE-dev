import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStatus } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMangaDto {
  @ApiProperty({ example: 'Blue Phoenix' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'A mangaka discovers an ancient pen spirit.',
  })
  @IsOptional()
  @IsString()
  synopsis?: string;

  @ApiProperty({ example: 'Nguyen Minh' })
  @IsString()
  @IsNotEmpty()
  authorName: string;

  @ApiPropertyOptional({
    enum: WorkflowStatus,
    default: WorkflowStatus.DRAFTING,
  })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ApiPropertyOptional({
    type: [String],
    example: ['fantasy', 'school-life'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
