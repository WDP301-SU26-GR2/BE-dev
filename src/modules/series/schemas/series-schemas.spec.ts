import {
  CreateProposalBodySchema,
  SeriesListItemSchema,
  SeriesResSchema,
  UpdateProposalBodySchema,
  UpdateSeriesMetadataBodySchema
} from './series-schemas'

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
      completionProposal: null,
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
      completionProposal: null,
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
      completionProposal: null,
      proposal: null
    })
    expect(parsed.coverImage).toBe('uploads/m1/cover.png')
  })
})

describe('UpdateSeriesMetadataBodySchema', () => {
  it('accepts only presentation metadata and supports clear values', () => {
    expect(
      UpdateSeriesMetadataBodySchema.parse({
        title: 'New title',
        coverImage: '',
        synopsis: '',
        characterDesigns: []
      })
    ).toEqual({ title: 'New title', coverImage: '', synopsis: '', characterDesigns: [] })
  })

  it('accepts null as keep-current PATCH semantics', () => {
    expect(UpdateSeriesMetadataBodySchema.parse({ coverImage: null, synopsis: null, characterDesigns: null })).toEqual({
      coverImage: null,
      synopsis: null,
      characterDesigns: null
    })
  })

  it.each(['genres', 'demographic', 'publicationType', 'magazine', 'startIssueNumber', 'status', 'mangakaId'])(
    'rejects protected field %s via strict schema',
    (field) => {
      expect(UpdateSeriesMetadataBodySchema.safeParse({ [field]: 'forbidden' }).success).toBe(false)
    }
  )

  it('rejects an empty title', () => {
    expect(UpdateSeriesMetadataBodySchema.safeParse({ title: '' }).success).toBe(false)
  })
})

// Spec 25 — chống drift giữa list và detail.
describe('SeriesListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(SeriesListItemSchema.shape)
  const detailKeys = Object.keys(SeriesResSchema.shape)

  it('bỏ proposal/completionProposal và field chỉ dùng ở detail', () => {
    for (const key of [
      'proposal',
      'completionProposal',
      'statusReason',
      'reviewStartedAt',
      'franchiseConsentStatus',
      'coOwnerId',
      'parentSeriesId',
      'relationshipType',
      'startIssueNumber'
    ]) {
      expect(listKeys).not.toContain(key)
    }
    expect(listKeys).toHaveLength(13)
  })

  // FE chốt 2026-07-26: magazine dùng làm tab lọc theo tạp chí → PHẢI giữ ở list.
  it('giữ magazine cho tab lọc theo tạp chí', () => {
    expect(listKeys).toContain('magazine')
  })

  // Spec 20 AC4: mini-embed để FE khỏi gọi thêm endpoint directory;
  // Spec 20 AC3: field ID vô hướng vẫn giữ vì mutation response không có embed.
  it('giữ mini-embed mangaka/editor kèm field ID vô hướng', () => {
    for (const key of ['mangaka', 'editor', 'mangakaId', 'editorId']) expect(listKeys).toContain(key)
  })

  it('là tập con thực sự của SeriesResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
