import { Injectable } from '@nestjs/common'
import { SeriesCaller, SeriesQueryService } from './services/series-query.service'
import { CreateProposalBodyType, ListSeriesQueryType, UpdateProposalBodyType } from './schemas/series-schemas'
import { toSeriesRes } from './series.mapper'
import { SeriesLifecycleService } from './services/series-lifecycle.service'
import { SeriesPitchService } from './services/series-pitch.service'
import { SeriesProposalService } from './services/series-proposal.service'
import { SeriesClaimService } from './services/series-claim.service'

// Spec 8: các route Name (lifecycle + reads + chapter-Name create) đã chuyển sang NameController→
// NameService trực tiếp. Orchestrator series.service chỉ còn proposal/pitch/claim/query/lifecycle.
@Injectable()
export class SeriesService {
  constructor(
    private readonly proposalService: SeriesProposalService,
    private readonly pitchService: SeriesPitchService,
    private readonly queryService: SeriesQueryService,
    private readonly claimService: SeriesClaimService,
    private readonly lifecycleService: SeriesLifecycleService
  ) {}

  createProposal(mangakaId: string, body: CreateProposalBodyType) {
    return this.proposalService.createProposal(mangakaId, body)
  }

  updateProposal(mangakaId: string, seriesId: string, body: UpdateProposalBodyType) {
    return this.proposalService.updateProposal(mangakaId, seriesId, body)
  }

  deleteProposal(mangakaId: string, seriesId: string) {
    return this.proposalService.deleteProposal(mangakaId, seriesId)
  }

  submit(mangakaId: string, seriesId: string) {
    return this.proposalService.submit(mangakaId, seriesId)
  }

  requestProposalRevision(editorId: string, seriesId: string, reason: string) {
    return this.proposalService.requestRevision(editorId, seriesId, reason)
  }

  resubmitProposal(mangakaId: string, seriesId: string) {
    return this.proposalService.resubmit(mangakaId, seriesId)
  }

  approveProposal(editorId: string, seriesId: string) {
    return this.proposalService.approve(editorId, seriesId)
  }

  rejectProposal(editorId: string, seriesId: string, reason: string) {
    return this.proposalService.reject(editorId, seriesId, reason)
  }

  withdraw(mangakaId: string, seriesId: string, reason: string) {
    return this.proposalService.withdraw(mangakaId, seriesId, reason)
  }

  franchiseConsent(seriesId: string, callerId: string, approve: boolean) {
    return this.proposalService.franchiseConsent(seriesId, callerId, approve)
  }

  pitch(editorId: string, seriesId: string) {
    return this.pitchService.pitch(editorId, seriesId)
  }

  claim(editorId: string, seriesId: string) {
    return this.claimService.claim(editorId, seriesId)
  }

  release(editorId: string, seriesId: string) {
    return this.claimService.release(editorId, seriesId)
  }

  listSeries(caller: SeriesCaller, query: ListSeriesQueryType) {
    return this.queryService.list(caller, query)
  }

  getSeries(caller: SeriesCaller, seriesId: string) {
    return this.queryService.getById(caller, seriesId)
  }

  // Spec 2 / Flow 5: Editor-driven series lifecycle (HIATUS / RESUME / FINALIZE_ENDING).
  // Lifecycle service returns raw Prisma entity; controller's @ZodResponse(SeriesResDto) requires
  // ISO-string createdAt, so wrap with toSeriesRes() ở orchestrator.
  async hiatus(editorId: string, seriesId: string, reason: string, expectedReturnDate?: string) {
    const series = await this.lifecycleService.hiatus(seriesId, editorId, reason, expectedReturnDate)
    return toSeriesRes(series)
  }

  async resume(editorId: string, seriesId: string) {
    const series = await this.lifecycleService.resume(seriesId, editorId)
    return toSeriesRes(series)
  }

  async finalizeEnding(editorId: string, seriesId: string) {
    const series = await this.lifecycleService.finalizeEnding(seriesId, editorId)
    return toSeriesRes(series)
  }
}
