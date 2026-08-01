import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ApiObjectIdParams, ObjectIdParamPipe } from 'src/core/http/pipes/object-id-param.pipe'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
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
  AnnotationTargetNotFoundException,
  AnnotationTaskBindingInvalidException
} from './errors/annotation.errors'

const AnnotationIdParamPipe = ObjectIdParamPipe.for(() => AnnotationNotFoundException)

@ApiTags('annotations')
@ApiBearerAuth()
@Controller('annotations')
export class AnnotationController {
  constructor(private readonly annotationService: AnnotationService) {}

  @Post()
  @ApiOperation({
    summary:
      'Tạo annotation/markup (TEXT/HIGHLIGHT/DRAWING + coordinates) trên target (Page/Region/Task/Manuscript/Storyboard)'
  })
  @ApiResponse({ status: 422, description: 'Validation fail (targetType/targetId/annotationType/...)' })
  @ApiErrors(AnnotationForbiddenException, AnnotationTargetNotFoundException, AnnotationTaskBindingInvalidException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 201, type: AnnotationResDto })
  create(@Body() body: CreateAnnotationBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.annotationService.create(user.userId, user.roleName, body)
  }

  // Query validate qua global CustomZodValidationPipe (createZodDto) — thiếu/sai targetType|targetId → 422.
  @Get()
  @ApiOperation({ summary: 'List annotation theo targetType + targetId (phân trang, mặc định 20/trang)' })
  @ApiResponse({ status: 422, description: 'Thiếu/sai query targetType hoặc targetId' })
  @ApiErrors(AnnotationForbiddenException, AnnotationTargetNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AnnotationListResDto })
  list(@Query() query: ListAnnotationQueryDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.annotationService.list(user.userId, user.roleName, query)
  }

  @Patch(':id/resolve')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Đánh dấu annotation đã giải quyết (isResolved=true). Chỉ author.' })
  @ApiErrors(AnnotationForbiddenException, AnnotationNotFoundException)
  @ZodResponse({ status: 200, type: AnnotationResDto })
  resolve(@Param('id', AnnotationIdParamPipe) id: string, @ActiveUser('userId') userId: string) {
    return this.annotationService.resolve(userId, id)
  }

  @Delete(':id')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Xoá annotation. Chỉ author.' })
  @ApiErrors(AnnotationForbiddenException, AnnotationNotFoundException)
  remove(@Param('id', AnnotationIdParamPipe) id: string, @ActiveUser('userId') userId: string) {
    return this.annotationService.remove(userId, id)
  }
}
