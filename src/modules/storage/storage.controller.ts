import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { SignDownloadBodyDto, SignDownloadResDto, SignUploadBodyDto, SignUploadResDto } from './dto/storage.dto'
import {
  AssetNotFoundException,
  DownloadForbiddenException,
  FileTooLargeException,
  UnsupportedFileTypeException
} from './errors/storage.errors'
import { StorageService } from './storage.service'

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('sign')
  @ApiOperation({
    summary: 'Xin signed URL upload (presigned PUT) lên R2; validate type/size; tạo Asset; trả uploadUrl + key'
  })
  @ApiErrors(UnsupportedFileTypeException, FileTooLargeException)
  @ZodResponse({ status: 201, type: SignUploadResDto })
  signUpload(@Body() body: SignUploadBodyDto, @ActiveUser('userId') userId: string) {
    return this.storageService.signUpload(userId, body)
  }

  @Post('sign-download')
  @ApiOperation({ summary: 'Xin signed URL download (presigned GET) cho 1 object key (chủ sở hữu / EDITOR / BOARD)' })
  @ApiErrors(DownloadForbiddenException, AssetNotFoundException)
  @ZodResponse({ status: 201, type: SignDownloadResDto })
  signDownload(@Body() body: SignDownloadBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.storageService.signDownload({ userId: user.userId, roleName: user.roleName }, body.key)
  }
}
