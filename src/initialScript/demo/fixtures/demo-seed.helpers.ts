import { createHash } from 'crypto'
import { SeededAccount, SeededMedia } from '../demo-db'

export const DAY = 86_400_000

export const requiredAccount = (accounts: Map<string, SeededAccount>, alias: string) => {
  const account = accounts.get(alias)
  if (!account) throw new Error(`Missing demo account ${alias}`)
  return account
}

export const requiredMedia = (media: Map<string, SeededMedia>, slug: string) => {
  const item = media.get(slug)
  if (!item) throw new Error(`Missing demo media ${slug}`)
  return item
}

export const pad = (value: number) => String(value).padStart(2, '0')
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
