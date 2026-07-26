import { NameStatus } from '@prisma/client'

export abstract class NameApprovalQueryPort {
  abstract findApprovalById(nameId: string): Promise<{ status: NameStatus } | null>
}
