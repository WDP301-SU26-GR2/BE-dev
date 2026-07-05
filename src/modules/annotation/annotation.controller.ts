import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { AnnotationService } from './annotation.service'
import {
  AnnotationListResDto,
  AnnotationResDto,
  CreateAnnotationBodyDto,
  ListAnnotationQueryDto
} from './dto/annotation.dto'
import {
  AnnotationForbiddenException,
  AnnotationNotFoundException,
  AnnotationTargetNotFoundException
} from './errors/annotation.errors'

@ApiTags('annotations')
@ApiBearerAuth()
@Controller('annotations')
export class AnnotationController {
  constructor(private readonly annotationService: AnnotationService) {}

  @Post()
  @ApiOperation({
    summary:
      'Tạo annotation/markup (TEXT/HIGHLIGHT/DRAWING + coordinates) trên target (Page/Region/Task/Manuscript/Name)'
  })
  @ApiResponse({ status: 422, description: 'Validation fail (targetType/targetId/annotationType/...)' })
  @ApiErrors(AnnotationTargetNotFoundException)
  @ZodResponse({ status: 201, type: AnnotationResDto })
  create(@Body() body: CreateAnnotationBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.annotationService.create(user.userId, user.roleName, body)
  }

  // Query validate qua global CustomZodValidationPipe (createZodDto) — thiếu/sai targetType|targetId → 422.
  @Get()
  @ApiOperation({ summary: 'List annotation theo targetType + targetId' })
  @ApiResponse({ status: 422, description: 'Thiếu/sai query targetType hoặc targetId' })
  @ZodResponse({ status: 200, type: AnnotationListResDto })
  list(@Query() query: ListAnnotationQueryDto) {
    return this.annotationService.list(query.targetType, query.targetId)
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Đánh dấu annotation đã giải quyết (isResolved=true). Chỉ author.' })
  @ApiErrors(AnnotationForbiddenException, AnnotationNotFoundException)
  @ZodResponse({ status: 200, type: AnnotationResDto })
  resolve(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.annotationService.resolve(userId, id)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá annotation. Chỉ author.' })
  @ApiErrors(AnnotationForbiddenException, AnnotationNotFoundException)
  remove(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.annotationService.remove(userId, id)
  }
}
