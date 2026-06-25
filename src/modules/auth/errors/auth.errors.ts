import {
  ConflictException,
  ForbiddenException,
  GoneException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common'

// OTP related errors
export const InvalidOTPException = new UnprocessableEntityException([
  {
    message: 'Error.InvalidOTP',
    path: 'code'
  }
])

export const OTPExpiredException = new GoneException('Error.OTPExpired')

export const OtpLockedException = new UnprocessableEntityException([
  {
    message: 'Error.OTPLocked',
    path: 'code'
  }
])

export const FailedToSendOTPException = new UnprocessableEntityException([
  {
    message: 'Error.FailedToSendOTP',
    path: 'code'
  }
])

// Email related errors
export const EmailAlreadyExistsException = new UnprocessableEntityException([
  {
    message: 'Error.EmailAlreadyExists',
    path: 'email'
  }
])

export const EmailNotFoundException = new UnprocessableEntityException([
  {
    message: 'Error.EmailNotFound',
    path: 'email'
  }
])

export const EmailAlreadyVerifiedException = new ConflictException('Error.EmailAlreadyVerified')
export const EmailNotVerifiedException = new ForbiddenException('Error.EmailNotVerified')

// Password related errors
export const InvalidPasswordException = new UnprocessableEntityException([
  {
    message: 'Error.InvalidPassword',
    path: 'password'
  }
])

// Auth token related errors
export const RefreshTokenAlreadyUsedException = new UnauthorizedException('Error.RefreshTokenAlreadyUsed')
export const UnauthorizedAccessException = new UnauthorizedException('Error.UnauthorizedAccess')

// Account status related errors
export const AccountBannedException = new ForbiddenException('Error.AccountBanned')

// Google auth related errors
export const InvalidGoogleTokenException = new UnauthorizedException('Error.InvalidGoogleToken')
export const GoogleEmailNotVerifiedException = new ForbiddenException('Error.GoogleEmailNotVerified')
export const GoogleAccountNotRegisteredException = new ForbiddenException('Error.GoogleAccountNotRegistered')
export const GoogleAccountMismatchException = new ConflictException('Error.GoogleAccountMismatch')

//2fa
export const TOTPEnableException = new UnprocessableEntityException([
  {
    message: 'Error.TOTPAlreadyEnabled',
    path: 'totpCode'
  }
])
export const TOTPNotEnabledException = new UnprocessableEntityException([
  {
    message: 'Error.TOTPNotEnabled',
    path: 'totpCode'
  }
])
export const InvalidTOTPException = new UnprocessableEntityException([
  {
    message: 'Error.InvalidTOTP',
    path: 'code'
  }
])

export const InvalidTOTPAndCodeException = new UnprocessableEntityException([
  {
    message: 'Error.InvalidTOTPAndCode',
    path: 'totpCode'
  },
  {
    message: 'Error.InvalidTOTPAndCode',
    path: 'code'
  }
])
