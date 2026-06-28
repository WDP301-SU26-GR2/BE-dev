import {
  ConflictException,
  ForbiddenException,
  GoneException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common'
import { AuthMessages } from '../auth.messages'

const E = AuthMessages.error

// OTP related errors
export const InvalidOTPException = new UnprocessableEntityException([{ message: E.invalidOtp, path: 'code' }])

export const OTPExpiredException = new GoneException(E.otpExpired)

export const OtpLockedException = new UnprocessableEntityException([{ message: E.otpLocked, path: 'code' }])

export const FailedToSendOTPException = new UnprocessableEntityException([{ message: E.failedToSendOtp, path: 'code' }])

// Email related errors
export const EmailAlreadyExistsException = new UnprocessableEntityException([
  { message: E.emailAlreadyExists, path: 'email' }
])

export const EmailNotFoundException = new UnprocessableEntityException([{ message: E.emailNotFound, path: 'email' }])

export const EmailAlreadyVerifiedException = new ConflictException(E.emailAlreadyVerified)
export const EmailNotVerifiedException = new ForbiddenException(E.emailNotVerified)
// Duplicate email on registration (unique-constraint) → 409 Conflict.
export const EmailConflictException = new ConflictException(E.emailAlreadyExists)

// Password related errors
export const InvalidPasswordException = new UnprocessableEntityException([
  { message: E.invalidPassword, path: 'password' }
])

// Auth token related errors
export const RefreshTokenAlreadyUsedException = new UnauthorizedException(E.refreshTokenAlreadyUsed)
export const UnauthorizedAccessException = new UnauthorizedException(E.unauthorizedAccess)

// Account status related errors
export const AccountBannedException = new ForbiddenException(E.accountBanned)

// Google auth related errors
export const InvalidGoogleTokenException = new UnauthorizedException(E.invalidGoogleToken)
export const GoogleEmailNotVerifiedException = new ForbiddenException(E.googleEmailNotVerified)
export const GoogleAccountNotRegisteredException = new ForbiddenException(E.googleAccountNotRegistered)
export const GoogleAccountMismatchException = new ConflictException(E.googleAccountMismatch)

//2fa
export const TOTPEnableException = new UnprocessableEntityException([
  { message: E.totpAlreadyEnabled, path: 'totpCode' }
])
export const TOTPNotEnabledException = new UnprocessableEntityException([
  { message: E.totpNotEnabled, path: 'totpCode' }
])
export const InvalidTOTPException = new UnprocessableEntityException([{ message: E.invalidTotp, path: 'code' }])

export const InvalidTOTPAndCodeException = new UnprocessableEntityException([
  { message: E.invalidTotpAndCode, path: 'totpCode' },
  { message: E.invalidTotpAndCode, path: 'code' }
])

//
