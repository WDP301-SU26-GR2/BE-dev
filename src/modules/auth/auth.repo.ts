import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { OtpCodeType, RoleType } from './schemas/auth.model'
import { OtpPurposeType } from './auth.constant'
import { UserType } from 'src/core/models/user.model'

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createUser(
    user: Pick<UserType, 'email' | 'roleId' | 'name' | 'password' | 'phoneNumber' | 'displayName' | 'status'>
  ): Promise<Omit<UserType, 'password'>> {
    return await this.prismaService.user.create({
      data: user,
      omit: { password: true }
    })
  }

  async createOtpRequest(
    payload: Pick<OtpCodeType, 'email' | 'otpCodeHash' | 'purpose' | 'expiresAt'>
  ): Promise<OtpCodeType> {
    return await this.prismaService.otpRequest.upsert({
      where: { email_purpose: { email: payload.email, purpose: payload.purpose } },
      update: { otpCodeHash: payload.otpCodeHash, expiresAt: payload.expiresAt, attempts: 0, isUsed: false },
      create: payload
    })
  }

  async findOtpRequest(where: { email: string; purpose: OtpPurposeType }) {
    return await this.prismaService.otpRequest.findUnique({
      where: { email_purpose: { email: where.email, purpose: where.purpose } }
    })
  }

  async incrementOtpAttempts(where: { email: string; purpose: OtpPurposeType }): Promise<void> {
    await this.prismaService.otpRequest.update({
      where: { email_purpose: { email: where.email, purpose: where.purpose } },
      data: { attempts: { increment: 1 } }
    })
  }

  async deleteOtpRequest(where: { email: string; purpose: OtpPurposeType }): Promise<void> {
    await this.prismaService.otpRequest.delete({
      where: { email_purpose: { email: where.email, purpose: where.purpose } }
    })
  }

  deleteExpiredOtpRequests(now: Date) {
    return this.prismaService.otpRequest.deleteMany({ where: { expiresAt: { lt: now } } })
  }

  async findUserWithRole(
    uniqueValue: { id: string } | { email: string }
  ): Promise<(UserType & { role: Pick<RoleType, 'code'> }) | null> {
    return await this.prismaService.user.findUnique({
      where: uniqueValue,
      include: { role: { select: { code: true } } }
    })
  }

  async findUserByEmail(email: string): Promise<UserType | null> {
    return await this.prismaService.user.findUnique({
      where: { email }
    })
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { password, mustChangePassword: false }
    })
  }

  async activateUser(userId: string): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', emailVerified: true }
    })
  }

  async setGoogleId(userId: string, googleId: string): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { googleId }
    })
  }

  async createRefreshToken(data: { token: string; userId: string; expiresAt: Date }) {
    return await this.prismaService.refreshToken.create({ data })
  }

  async findRefreshToken(token: string) {
    return await this.prismaService.refreshToken.findUnique({
      where: { token }
    })
  }

  async deleteRefreshToken(token: string) {
    return await this.prismaService.refreshToken.delete({
      where: { token }
    })
  }

  async deleteRefreshTokensByUserId(userId: string): Promise<void> {
    await this.prismaService.refreshToken.deleteMany({
      where: { userId }
    })
  }
}
