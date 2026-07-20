import { Logger } from '@nestjs/common'
import { UserStatus } from '@prisma/client'
import { config } from 'dotenv'
import { env } from 'process'
import { RoleName } from 'src/core/security/constants/role.constant'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
config()

const prisma = new PrismaService()
const hashingService = new HashingService()
const logger = new Logger('InitialScript')

export const main = async () => {
  await prisma.$connect()
  const roleCount = await prisma.role.count()
  if (roleCount > 0) {
    throw new Error('Roles already exist in the database. Please clear the roles table before running this script.')
  }
  const roles = await prisma.role.createMany({
    data: [
      {
        code: RoleName.SUPER_ADMIN,
        description: 'Super Administrator with full access to all resources and permissions.',
        isSystem: true
      },
      {
        code: RoleName.MANGAKA,
        description: 'Create a profile for your new series and submit a preliminary draft to the review board.'
      },
      {
        code: RoleName.ASSISTANT,
        description:
          'View the list of assigned tasks, upload the comic page file to be processed, and any supporting resources.'
      },
      {
        code: RoleName.EDITOR,
        description:
          'Review the draft and directly mark on the page the places that need editing in content, dialogue, and script.'
      },
      {
        code: RoleName.BOARD_MEMBER,
        description: 'Vote for the new series and decide on the publication schedule (weekly or monthly).'
      }
    ]
  })
  const adminRole = await prisma.role.findFirstOrThrow({
    where: { code: RoleName.SUPER_ADMIN }
  })
  const createAdmin = await prisma.user.create({
    data: {
      email: env.ADMIN_EMAIL as string,
      password: await hashingService.hash(env.ADMIN_PASSWORD as string),
      name: env.ADMIN_NAME as string,
      phoneNumber: env.ADMIN_PHONE as string,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      registrationType: 'ADMIN_CREATED',
      roleId: adminRole.id
    }
  })

  return {
    createdRoleCount: roles.count,
    createdAdmin: createAdmin
  }
}

export const initDB = async () => {
  try {
    const { createdRoleCount } = await main()
    logger.log(`Created ${createdRoleCount} roles`)
  } catch (error) {
    logger.error('Error seeding data:', error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
