import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
  ChangePasswordBodyDto,
  ForgotPasswordBodyDto,
  LoginBodyDto,
  LoginResDto,
  LogoutBodyDto,
  RefreshTokenBodyDto,
  RefreshTokenResDto,
  RegisterBodyDto,
  SendOtpBodyDto,
  VerifyEmailBodyDto
} from './dto/auth.dto'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { SkipPasswordPolicy } from 'src/core/security/decorators/skip-password-policy.decorator'
import { AuthService } from './services/auth.service'
import { ZodResponse } from 'nestjs-zod'
import { MessageResDto } from 'src/core/http/response.dto'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @IsPublic()
  @ZodResponse({ type: MessageResDto })
  register(@Body() body: RegisterBodyDto) {
    return this.authService.registerService(body)
  }

  @Post('verify-email')
  @IsPublic()
  @ZodResponse({ type: MessageResDto })
  verifyEmail(@Body() body: VerifyEmailBodyDto) {
    return this.authService.verifyEmailService(body)
  }

  @Post('send-otp-email')
  @IsPublic()
  @ZodResponse({ type: MessageResDto })
  sendOtp(@Body() body: SendOtpBodyDto) {
    return this.authService.sendOTPService(body)
  }

  @Post('login')
  @IsPublic()
  @ZodResponse({ type: LoginResDto })
  login(@Body() body: LoginBodyDto) {
    return this.authService.loginService(body)
  }

  @Post('logout')
  @IsPublic()
  @ZodResponse({ type: MessageResDto })
  logout(@Body() body: LogoutBodyDto) {
    return this.authService.logoutService(body)
  }

  @Post('refresh-token')
  @IsPublic()
  @ZodResponse({ type: RefreshTokenResDto })
  refreshToken(@Body() body: RefreshTokenBodyDto) {
    return this.authService.refreshTokenService(body)
  }

  @Post('forgot-password')
  @IsPublic()
  @ZodResponse({ type: MessageResDto })
  forgotPassword(@Body() body: ForgotPasswordBodyDto) {
    return this.authService.forgotPasswordService(body)
  }

  @Post('change-password')
  @SkipPasswordPolicy()
  @ZodResponse({ type: MessageResDto })
  changePassword(@Body() body: ChangePasswordBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.authService.changePasswordService(body, user.userId)
  }
}
