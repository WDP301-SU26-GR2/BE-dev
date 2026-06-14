import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/shared/services/prisma.service'
import { UserType } from 'src/shared/models/shared-user.model'

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findUnique(uniqueObject: { id: string } | { email: string }): Promise<UserType | null> {
    return await this.prismaService.user.findUnique({
      where: uniqueObject
    })
  }
}
