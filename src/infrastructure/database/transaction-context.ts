import type { Prisma } from '@prisma/client'

declare const transactionContextBrand: unique symbol
export type TransactionContext = { readonly [transactionContextBrand]: true }

const clients = new WeakMap<object, Prisma.TransactionClient>()

export function createTransactionContext(client: Prisma.TransactionClient): TransactionContext {
  const context = {} as TransactionContext
  clients.set(context, client)
  return context
}

export function transactionClient(context: TransactionContext): Prisma.TransactionClient {
  const client = clients.get(context)
  if (!client) throw new Error('Transaction context is no longer valid')
  return client
}
