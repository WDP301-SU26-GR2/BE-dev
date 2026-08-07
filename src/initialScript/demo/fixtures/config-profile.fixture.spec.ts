import { PublicationType } from '@prisma/client'
import { mergeDemoMagazines } from './config-profile.fixture'

describe('demo magazine catalog fixture', () => {
  it('registers both demo magazines with their required cadence and preserves unrelated entries', () => {
    const result = mergeDemoMagazines([
      { name: 'Existing Editorial', publicationTypes: [PublicationType.IRREGULAR] },
      { name: 'Manga Nexus Weekly', publicationTypes: [PublicationType.IRREGULAR] }
    ])

    expect(result).toEqual(
      expect.arrayContaining([
        { name: 'Existing Editorial', publicationTypes: [PublicationType.IRREGULAR] },
        {
          name: 'Manga Nexus Weekly',
          publicationTypes: expect.arrayContaining([PublicationType.WEEKLY, PublicationType.IRREGULAR])
        },
        { name: 'Manga Nexus Monthly', publicationTypes: [PublicationType.MONTHLY] }
      ])
    )
  })
})
