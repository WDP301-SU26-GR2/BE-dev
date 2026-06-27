import { CreateProposalBodySchema, SeriesResSchema, UpdateProposalBodySchema } from './series-schemas'

describe('series schemas — coverImage', () => {
  it('CreateProposalBody accepts coverImage', () => {
    const parsed = CreateProposalBodySchema.parse({ title: 'T', coverImage: 'uploads/m1/cover.png' })
    expect(parsed.coverImage).toBe('uploads/m1/cover.png')
  })

  it('CreateProposalBody coverImage is optional', () => {
    const parsed = CreateProposalBodySchema.parse({ title: 'T' })
    expect(parsed.coverImage).toBeUndefined()
  })

  it('UpdateProposalBody accepts coverImage', () => {
    const parsed = UpdateProposalBodySchema.parse({ coverImage: 'uploads/m1/new.png' })
    expect(parsed.coverImage).toBe('uploads/m1/new.png')
  })

  it('SeriesRes keeps coverImage', () => {
    const parsed = SeriesResSchema.parse({
      id: 's1',
      mangakaId: 'm1',
      editorId: null,
      coOwnerId: null,
      parentSeriesId: null,
      title: 'T',
      coverImage: 'uploads/m1/cover.png',
      genre: null,
      demographic: null,
      publicationType: null,
      status: 'DRAFT',
      statusReason: null,
      relationshipType: null,
      createdAt: '2026-06-23T00:00:00.000Z',
      proposal: null
    })
    expect(parsed.coverImage).toBe('uploads/m1/cover.png')
  })
})
