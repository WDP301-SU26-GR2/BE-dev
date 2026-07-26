import { Injectable } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { createTransactionContext, TransactionContext } from './transaction-context'

@Injectable()
export class DatabaseUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((client) => work(createTransactionContext(client)))
  }
}
