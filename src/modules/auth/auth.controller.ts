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
  SendOtpBodyDto
} from './dto/auth.dto'
import { IsPublic } from 'src/shared/decorators/auth.decorator'
import { ActiveUser } from 'src/shared/decorators/active-user.decorator'
import { AuthService } from './services/auth.service'
import { ZodResponse } from 'nestjs-zod'
import { MessageResDto } from 'src/shared/dto/response.dto'
import type { JwtAccessTokenPayload } from 'src/shared/types/jwt.type'

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
  @ZodResponse({ type: MessageResDto })
  changePassword(@Body() body: ChangePasswordBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.authService.changePasswordService(body, user.userId)
  }
}
