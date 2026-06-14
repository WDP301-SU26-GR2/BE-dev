import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/shared/database/prisma.service'
import { OtpCodeType, RoleType } from './schemas/auth.model'
import { OtpPurposeType } from 'src/shared/constant/auth.constant'
import { UserType } from 'src/shared/models/shared-user.model'

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
    //tìm kiếm bản ghi theo email, purpose và otpCodeHash
    const existingOtpRequest = await this.prismaService.otpRequest.findUnique({
      where: {
        email_purpose_otpCodeHash: {
          email: payload.email,
          purpose: payload.purpose,
          otpCodeHash: payload.otpCodeHash
        }
      }
    })

    if (existingOtpRequest) {
      return await this.prismaService.otpRequest.update({
        where: { id: existingOtpRequest.id },
        data: payload
      })
    }

    return await this.prismaService.otpRequest.create({
      data: payload
    })
  }

  async findOtpRequest(
    uniqueValue:
      | { id: string }
      | {
          email_purpose_otpCodeHash: {
            email: string
            otpCodeHash: string
            purpose: OtpPurposeType
          }
        }
  ) {
    return await this.prismaService.otpRequest.findUnique({
      where: uniqueValue
    })
  }

  async deleteOtpRequest(
    uniqueValue:
      | { id: string }
      | {
          email_purpose_otpCodeHash: {
            email: string
            otpCodeHash: string
            purpose: OtpPurposeType
          }
        }
  ): Promise<OtpCodeType> {
    return await this.prismaService.otpRequest.delete({
      where: uniqueValue
    })
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
      data: { password }
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
