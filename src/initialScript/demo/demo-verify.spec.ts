import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ProposalStatus, SeriesStatus } from '@prisma/client'
import { DEMO_MEDIA, demoMediaKey } from './demo-media'
import { verifyProposalShowcase } from './demo-verify'

describe('Spec 28 demo proposal fixtures', () => {
  const knownMediaKey = demoMediaKey(DEMO_MEDIA[0])

  it('fails verification when any required review showcase state is missing', () => {
    const result = verifyProposalShowcase([
      {
        title: 'review',
        status: SeriesStatus.IN_REVIEW,
        proposal: {
          status: ProposalStatus.PROPOSAL_REVIEW,
          storyboardPages: [{ pageNumber: 1, fileUrl: knownMediaKey }]
        }
      },
      {
        title: 'ready',
        status: SeriesStatus.READY_TO_PITCH,
        proposal: {
          status: ProposalStatus.PROPOSAL_APPROVED,
          storyboardPages: [{ pageNumber: 1, fileUrl: knownMediaKey }]
        }
      }
    ])

    expect(result.checks).toEqual({
      proposalsWithStoryboardPages: 2,
      proposalReviewSeries: 1,
      proposalRevisionSeries: 0,
      readyToPitchSeries: 1
    })
    expect(result.failures).toContain('proposalRevisionSeries: expected >= 1, received 0')
  })

  it('rejects empty proposal pages instead of allowing a false pass', () => {
    const result = verifyProposalShowcase([
      {
        title: 'empty review',
        status: SeriesStatus.IN_REVIEW,
        proposal: { status: ProposalStatus.PROPOSAL_REVIEW, storyboardPages: [] }
      }
    ])

    expect(result.checks.proposalsWithStoryboardPages).toBe(0)
    expect(result.failures.join('\n')).toContain('storyboardPages')
  })

  it.each(['', '   '])('rejects a proposal storyboard page with an empty media key: %j', (fileUrl) => {
    const result = verifyProposalShowcase([
      {
        title: 'invalid media key',
        status: SeriesStatus.IN_REVIEW,
        proposal: {
          status: ProposalStatus.PROPOSAL_REVIEW,
          storyboardPages: [{ pageNumber: 1, fileUrl }]
        }
      }
    ])

    expect(result.checks.proposalsWithStoryboardPages).toBe(0)
    expect(result.failures.join('\n')).toContain('invalid media key')
  })

  it('rejects a proposal storyboard page with an invalid page number', () => {
    const result = verifyProposalShowcase([
      {
        title: 'invalid page number',
        status: SeriesStatus.IN_REVIEW,
        proposal: {
          status: ProposalStatus.PROPOSAL_REVIEW,
          storyboardPages: [{ pageNumber: 0, fileUrl: knownMediaKey }]
        }
      }
    ])

    expect(result.checks.proposalsWithStoryboardPages).toBe(0)
    expect(result.failures.join('\n')).toContain('invalid page number')
  })

  it('does not count READY_TO_PITCH when the proposal is not approved', () => {
    const result = verifyProposalShowcase([
      {
        title: 'invalid ready state',
        status: SeriesStatus.READY_TO_PITCH,
        proposal: {
          status: ProposalStatus.PROPOSAL_REVIEW,
          storyboardPages: [{ pageNumber: 1, fileUrl: knownMediaKey }]
        }
      }
    ])

    expect(result.checks.readyToPitchSeries).toBe(0)
    expect(result.failures).toContain('readyToPitchSeries: expected >= 1, received 0')
  })

  it('does not seed a parallel approved-proposal review state', () => {
    const source = readFileSync(join(__dirname, 'fixtures', 'series-flow.fixture.ts'), 'utf8')

    expect(source).not.toMatch(
      /seriesStatus:\s*SeriesStatus\.IN_REVIEW,\s*proposalStatus:\s*ProposalStatus\.PROPOSAL_APPROVED/
    )
  })

  it('keeps direct franchise proposal fixtures structurally complete', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', '..', 'test', 'flows', 'flow-12-13-franchise-publication.ts'),
      'utf8'
    )

    expect(source.match(/proposal:\s*\{/g)?.length).toBe(3)
    expect(source.match(/storyboardPages:/g)?.length).toBe(3)
  })

  it('asserts the persisted Chapter.storyboardId against the created storyboard', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', '..', 'test', 'flows', 'flow-02-chapter-production.ts'),
      'utf8'
    )

    expect(source).toMatch(/fetchedChapter\?\.storyboardId\s*===\s*c1Storyboard\.id/)
  })

  it('types proposalStatus with Prisma ProposalStatus and does not cast the proposal composite', () => {
    const source = readFileSync(join(__dirname, '..', '..', '..', 'test', 'flows', 'lib', 'seed.ts'), 'utf8')

    expect(source).toContain('proposalStatus?: ProposalStatus')
    expect(source).not.toContain('proposalStatus?: string')
    expect(source).not.toMatch(/createdAt:\s*new Date\(\)\s*\}\s+as never/)
  })
})
