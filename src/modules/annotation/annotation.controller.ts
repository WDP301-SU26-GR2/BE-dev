import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { AnnotationService } from './annotation.service'
import {
  AnnotationListResDto,
  AnnotationResDto,
  CreateAnnotationBodyDto,
  ListAnnotationQueryDto
} from './dto/annotation.dto'

@ApiTags('annotations')
@ApiBearerAuth()
@Controller('annotations')
export class AnnotationController {
  constructor(private readonly annotationService: AnnotationService) {}

  @Post()
  @ZodResponse({ type: AnnotationResDto })
  create(@Body() body: CreateAnnotationBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.annotationService.create(user.userId, user.roleName, body)
  }

  // Query validate qua global CustomZodValidationPipe (createZodDto) — thiếu/sai targetType|targetId → 422.
  @Get()
  @ZodResponse({ type: AnnotationListResDto })
  list(@Query() query: ListAnnotationQueryDto) {
    return this.annotationService.list(query.targetType, query.targetId)
  }

  @Patch(':id/resolve')
  @ZodResponse({ type: AnnotationResDto })
  resolve(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.annotationService.resolve(userId, id)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.annotationService.remove(userId, id)
  }
}
