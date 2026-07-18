import { HttpMessages } from '../http.messages'
import { SecurityMessages } from '../../security/security.messages'
import { AiMessages } from 'src/modules/ai/ai.messages'
import { AnnotationMessages } from 'src/modules/annotation/annotation.messages'
import { AuthMessages } from 'src/modules/auth/auth.messages'
import { BoardMessages } from 'src/modules/board/board.messages'
import { ChapterMessages } from 'src/modules/chapter/chapter.messages'
import { ContractMessages } from 'src/modules/contract/contract.messages'
import { DeadlineMessages } from 'src/modules/deadline/deadline.messages'
import { NameMessages } from 'src/modules/name/name.messages'
import { NotificationMessages } from 'src/modules/notification/notification.messages'
import { PaymentMessages } from 'src/modules/payment/payment.messages'
import { PublicMessages } from 'src/modules/public/public.messages'
import { PublicationMessages } from 'src/modules/publication/publication.messages'
import { ReprintRequestMessages } from 'src/modules/reprint/reprint-request.messages'
import { ReviewsMessages } from 'src/modules/reviews/reviews.messages'
import { RevisionMessages } from 'src/modules/revision/revision.messages'
import { SeriesMessages } from 'src/modules/series/series.messages'
import { StorageMessages } from 'src/modules/storage/storage.messages'
import { StudioMessages } from 'src/modules/studio/studio.messages'
import { SurveyMessages } from 'src/modules/survey/survey.messages'
import { TankobonMessages } from 'src/modules/tankobon/tankobon.messages'
import { TaskMessages } from 'src/modules/task/task.messages'
import { TransferMessages } from 'src/modules/transfer/transfer.messages'
import { UsersMessages } from 'src/modules/users/users.messages'

export type MessageCatalog = {
  error?: Record<string, string>
  errorText?: Record<string, string>
}

export type NamedMessageCatalog = { name: string; catalog: MessageCatalog }

const catalog = (value: unknown): MessageCatalog => value as MessageCatalog

export const MESSAGE_CATALOGS: NamedMessageCatalog[] = [
  { name: 'core/http', catalog: catalog(HttpMessages) },
  { name: 'core/security', catalog: catalog(SecurityMessages) },
  { name: 'ai', catalog: catalog(AiMessages) },
  { name: 'annotation', catalog: catalog(AnnotationMessages) },
  { name: 'auth', catalog: catalog(AuthMessages) },
  { name: 'board', catalog: catalog(BoardMessages) },
  { name: 'chapter', catalog: catalog(ChapterMessages) },
  { name: 'contract', catalog: catalog(ContractMessages) },
  { name: 'deadline', catalog: catalog(DeadlineMessages) },
  { name: 'name', catalog: catalog(NameMessages) },
  { name: 'notification', catalog: catalog(NotificationMessages) },
  { name: 'payment', catalog: catalog(PaymentMessages) },
  { name: 'public', catalog: catalog(PublicMessages) },
  { name: 'publication', catalog: catalog(PublicationMessages) },
  { name: 'reprint', catalog: catalog(ReprintRequestMessages) },
  { name: 'reviews', catalog: catalog(ReviewsMessages) },
  { name: 'revision', catalog: catalog(RevisionMessages) },
  { name: 'series', catalog: catalog(SeriesMessages) },
  { name: 'storage', catalog: catalog(StorageMessages) },
  { name: 'studio', catalog: catalog(StudioMessages) },
  { name: 'survey', catalog: catalog(SurveyMessages) },
  { name: 'tankobon', catalog: catalog(TankobonMessages) },
  { name: 'task', catalog: catalog(TaskMessages) },
  { name: 'transfer', catalog: catalog(TransferMessages) },
  { name: 'users', catalog: catalog(UsersMessages) }
]

export function buildErrorTextRegistry(catalogs: NamedMessageCatalog[]): Record<string, string> {
  const registry: Record<string, string> = {}
  const owners = new Map<string, string>()

  for (const { name, catalog: messageCatalog } of catalogs) {
    for (const [code, text] of Object.entries(messageCatalog.errorText ?? {})) {
      const existing = registry[code]
      if (existing !== undefined && existing !== text) {
        throw new Error(`Conflicting Vietnamese error text for ${code}: ${owners.get(code)} != ${name}`)
      }
      registry[code] = text
      if (!owners.has(code)) owners.set(code, name)
    }
  }

  return registry
}

export const ERROR_TEXT_VI: Record<string, string> = buildErrorTextRegistry(MESSAGE_CATALOGS)

export const isKnownCode = (value: string): boolean =>
  value in ERROR_TEXT_VI || /^Error\.[A-Za-z][A-Za-z0-9]*$/.test(value) || /^[A-Z][A-Z0-9_]+$/.test(value)

export const translateErrorCode = (code: string): string => ERROR_TEXT_VI[code] ?? code
