import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { SignDownloadBodyDto, SignDownloadResDto, SignUploadBodyDto, SignUploadResDto } from './dto/storage.dto'
import { StorageService } from './storage.service'

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('sign')
  @ZodResponse({ type: SignUploadResDto })
  signUpload(@Body() body: SignUploadBodyDto, @ActiveUser('userId') userId: string) {
    return this.storageService.signUpload(userId, body)
  }

  @Post('sign-download')
  @ZodResponse({ type: SignDownloadResDto })
  signDownload(@Body() body: SignDownloadBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.storageService.signDownload({ userId: user.userId, roleName: user.roleName }, body.key)
  }
}
