import { Body, Controller, Post } from '@nestjs/common'
import { UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  ChangePasswordBodyDto,
  ForgotPasswordBodyDto,
  GoogleLoginBodyDto,
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
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { SkipPasswordPolicy } from 'src/core/security/decorators/skip-password-policy.decorator'
import { AuthService } from './services/auth.service'
import { ZodResponse } from 'nestjs-zod'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { OtpRateLimitGuard } from 'src/core/security/guards/otp-rate-limit.guard'
import { OtpRateLimitedException } from 'src/core/security/errors/rate-limit.errors'
import {
  AccountBannedException,
  EmailAlreadyExistsException,
  EmailAlreadyVerifiedException,
  EmailConflictException,
  EmailNotFoundException,
  EmailNotVerifiedException,
  GoogleAccountMismatchException,
  GoogleAccountNotRegisteredException,
  GoogleEmailNotVerifiedException,
  InvalidGoogleTokenException,
  InvalidOTPException,
  InvalidPasswordException,
  OtpLockedException,
  OTPExpiredException,
  RefreshTokenAlreadyUsedException,
  UnauthorizedAccessException
} from './errors/auth.errors'

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Dang ky Mangaka/Assistant -> User INACTIVE + gui OTP (purpose=REGISTER). Public.' })
  @ApiResponse({ status: 422, description: 'Validation (password >=8, hoa/thuong/so; roleCode chi MANGAKA/ASSISTANT)' })
  @ApiErrors(EmailConflictException, OtpRateLimitedException(0))
  @IsPublic()
  @UseGuards(OtpRateLimitGuard)
  @ZodResponse({ status: 201, type: MessageResDto })
  register(@Body() body: RegisterBodyDto) {
    return this.authService.registerService(body)
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Xac thuc email bang OTP -> emailVerified=true + status=ACTIVE. Public.' })
  @ApiErrors(
    EmailAlreadyVerifiedException,
    OTPExpiredException,
    InvalidOTPException,
    OtpLockedException,
    EmailNotFoundException
  )
  @IsPublic()
  @ZodResponse({ status: 201, type: MessageResDto })
  verifyEmail(@Body() body: VerifyEmailBodyDto) {
    return this.authService.verifyEmailService(body)
  }

  @Post('send-otp-email')
  @ApiOperation({ summary: 'Gui lai OTP qua email (cho tai khoan chua verify). Public.' })
  @ApiErrors(EmailNotFoundException, EmailAlreadyExistsException, OtpRateLimitedException(0))
  @IsPublic()
  @UseGuards(OtpRateLimitGuard)
  @ZodResponse({ status: 201, type: MessageResDto })
  sendOtp(@Body() body: SendOtpBodyDto) {
    return this.authService.sendOTPService(body)
  }

  @Post('login')
  @ApiOperation({ summary: 'Dang nhap (email + password) -> access JWT + refresh token. Public.' })
  @ApiErrors(AccountBannedException, EmailNotVerifiedException, EmailNotFoundException, InvalidPasswordException)
  @IsPublic()
  @ZodResponse({ status: 201, type: LoginResDto })
  login(@Body() body: LoginBodyDto) {
    return this.authService.loginService(body)
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout -> revoke refresh token hien tai. Public (gui refresh token trong body).' })
  @ApiErrors(UnauthorizedAccessException)
  @IsPublic()
  @ZodResponse({ status: 201, type: MessageResDto })
  logout(@Body() body: LogoutBodyDto) {
    return this.authService.logoutService(body)
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Rotate refresh token -> cap access moi + revoke refresh cu. Public.' })
  @ApiErrors(
    UnauthorizedAccessException,
    RefreshTokenAlreadyUsedException,
    AccountBannedException,
    EmailNotVerifiedException
  )
  @IsPublic()
  @ZodResponse({ status: 201, type: RefreshTokenResDto })
  refreshToken(@Body() body: RefreshTokenBodyDto) {
    return this.authService.refreshTokenService(body)
  }

  // Khong rate-limit o day: forgot-password la buoc RESET (validate OTP + doi mat khau), khong gui OTP.
  // Dung chung email-cooldown voi send-otp-email se chan chinh buoc reset trong 60s sau khi xin OTP.
  // Brute-force code da bi chan boi OTP attempts lockout (AUTH_OTP_MAX_ATTEMPTS).
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Dat lai mat khau bang OTP (purpose=FORGOT_PASSWORD) + revoke toan bo refresh token. Public.'
  })
  @ApiErrors(
    OTPExpiredException,
    EmailNotFoundException,
    InvalidOTPException,
    OtpLockedException,
    InvalidPasswordException
  )
  @IsPublic()
  @ZodResponse({ status: 201, type: MessageResDto })
  forgotPassword(@Body() body: ForgotPasswordBodyDto) {
    return this.authService.forgotPasswordService(body)
  }

  @Post('google')
  @ApiOperation({ summary: 'Dang nhap Google (FE gui idToken) -> access + refresh. Public.' })
  @ApiErrors(
    InvalidGoogleTokenException,
    GoogleEmailNotVerifiedException,
    GoogleAccountNotRegisteredException,
    AccountBannedException,
    EmailNotVerifiedException,
    GoogleAccountMismatchException
  )
  @IsPublic()
  @ZodResponse({ status: 201, type: LoginResDto })
  googleLogin(@Body() body: GoogleLoginBodyDto) {
    return this.authService.googleLoginService(body)
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Doi mat khau (user da dang nhap; dung cho lan dau mustChangePassword)' })
  @ApiErrors(InvalidPasswordException)
  @SkipPasswordPolicy()
  @ZodResponse({ status: 201, type: MessageResDto })
  changePassword(@Body() body: ChangePasswordBodyDto, @ActiveUser() user: JwtAccessTokenPayload) {
    return this.authService.changePasswordService(body, user.userId)
  }
}
