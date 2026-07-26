import { MongoIndexBootstrapService } from 'src/infrastructure/database/mongo-index-bootstrap.service'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

async function bootstrapMongoIndexes() {
  const prisma = new PrismaService()
  await prisma.$connect()
  try {
    await new MongoIndexBootstrapService(prisma).ensureVoteOtpIndexes()
    await new MongoIndexBootstrapService(prisma).ensureTransferIndexes()
  } finally {
    await prisma.$disconnect()
  }
}

void bootstrapMongoIndexes()
