import { Injectable } from '@nestjs/common'
import { ListAssistantsQueryType, ListMangakasQueryType } from '../schemas/users-schemas'
import { AssistantDirectoryService } from './assistant-directory.service'
import { MangakaDirectoryService } from './mangaka-directory.service'

@Injectable()
export class UserDirectoryFacade {
  constructor(
    private readonly assistantDirectory: AssistantDirectoryService,
    private readonly mangakaDirectory: MangakaDirectoryService
  ) {}

  listAssistants(query: ListAssistantsQueryType) {
    return this.assistantDirectory.list(query)
  }
  listMangakas(query: ListMangakasQueryType) {
    return this.mangakaDirectory.list(query)
  }
}
