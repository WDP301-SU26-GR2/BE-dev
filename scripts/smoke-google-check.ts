import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

prisma.user
  .findUnique({
    where: { email: 'baophi852@gmail.com' },
    select: { id: true, email: true, googleId: true, status: true, emailVerified: true }
  })
  .then((u) => console.log(JSON.stringify(u, null, 2)))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
