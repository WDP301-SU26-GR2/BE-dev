import { CreateProposalBodySchema, SeriesResSchema, UpdateProposalBodySchema } from './series-schemas'

describe('Genre/Demographic enums', () => {
  it('CreateProposalBody chấp nhận genres enum hợp lệ + demographic', () => {
    const parsed = CreateProposalBodySchema.parse({
      title: 'My Series',
      genres: ['ACTION', 'ROMANCE'],
      demographic: 'SHONEN'
    })
    expect(parsed.genres).toEqual(['ACTION', 'ROMANCE'])
    expect(parsed.demographic).toBe('SHONEN')
  })

  it('CreateProposalBody mặc định genres = [] khi omit', () => {
    const parsed = CreateProposalBodySchema.parse({ title: 'X' })
    expect(parsed.genres).toEqual([])
    expect(parsed.demographic).toBeUndefined()
  })

  it('CreateProposalBody reject genre không thuộc enum', () => {
    expect(() => CreateProposalBodySchema.parse({ title: 'X', genres: ['action'] })).toThrow()
  })

  it('CreateProposalBody reject demographic lạ', () => {
    expect(() => CreateProposalBodySchema.parse({ title: 'X', demographic: 'OTAKU' })).toThrow()
  })

  it('SeriesRes có genres mảng + demographic nullable', () => {
    const ok = SeriesResSchema.parse({
      id: 'a',
      mangakaId: 'm',
      editorId: null,
      coOwnerId: null,
      parentSeriesId: null,
      title: 'T',
      coverImage: null,
      genres: ['ACTION'],
      demographic: null,
      publicationType: null,
      magazine: null,
      startIssueNumber: null,
      status: 'DRAFT',
      statusReason: null,
      relationshipType: null,
      franchiseConsentStatus: null,
      createdAt: '2026-06-29T00:00:00.000Z',
      reviewStartedAt: null,
      proposal: null
    })
    expect(ok.genres).toEqual(['ACTION'])
  })

  it('SeriesRes preserves serialization slot (magazine + startIssueNumber)', () => {
    const ok = SeriesResSchema.parse({
      id: 'a',
      mangakaId: 'm',
      editorId: null,
      coOwnerId: null,
      parentSeriesId: null,
      title: 'T',
      coverImage: null,
      genres: [],
      demographic: null,
      publicationType: 'WEEKLY',
      magazine: 'Weekly Shonen',
      startIssueNumber: 5,
      status: 'SERIALIZED',
      statusReason: null,
      relationshipType: null,
      franchiseConsentStatus: null,
      createdAt: '2026-06-29T00:00:00.000Z',
      reviewStartedAt: null,
      proposal: null
    })
    expect(ok.magazine).toBe('Weekly Shonen')
    expect(ok.startIssueNumber).toBe(5)
  })
})

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

  it('UpdateProposalBody rejects namePages', () => {
    expect(UpdateProposalBodySchema.safeParse({ namePages: [] }).success).toBe(false)
  })

  it('UpdateProposalBody accepts null fields', () => {
    const parsed = UpdateProposalBodySchema.parse({ genres: null })
    expect(parsed.genres).toBeNull()
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
      genres: [],
      demographic: null,
      publicationType: null,
      magazine: null,
      startIssueNumber: null,
      status: 'DRAFT',
      statusReason: null,
      relationshipType: null,
      franchiseConsentStatus: null,
      createdAt: '2026-06-23T00:00:00.000Z',
      reviewStartedAt: null,
      proposal: null
    })
    expect(parsed.coverImage).toBe('uploads/m1/cover.png')
  })
})
