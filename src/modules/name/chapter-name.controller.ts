import { Body, Controller, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { NameService } from './name.service'
import { CreateChapterNameBodyDto, NameResDto } from './dto/name.dto'
import {
  ChapterNotFoundException,
  ChapterNotDraftForNameException,
  ChapterNameAlreadyExistsException,
  NotSeriesOwnerException
} from './errors/name.errors'

@ApiTags('names')
@ApiBearerAuth()
@Controller('chapters/:id/names')
export class ChapterNameController {
  constructor(private readonly nameService: NameService) {}

  @ApiOperation({
    summary: 'Mangaka tạo chapter-Name (storyboard) cho chapter DRAFT — chapter-first'
  })
  @ApiErrors(
    ChapterNotFoundException,
    NotSeriesOwnerException,
    ChapterNotDraftForNameException,
    ChapterNameAlreadyExistsException
  )
  @Post()
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  create(@Param('id') id: string, @Body() body: CreateChapterNameBodyDto, @ActiveUser('userId') userId: string) {
    return this.nameService.createChapterName(userId, id, body)
  }
}
