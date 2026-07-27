import {
  isAssignmentActiveNow,
  toAssignmentListItem,
  toAssignmentRes,
  toInviteListItem,
  toInviteRes
} from './studio.mapper'

const now = new Date('2026-07-27T12:00:00.000Z')

const invite = {
  id: 'invite-1',
  mangakaId: 'm1',
  assistantId: 'a1',
  seriesId: 's1',
  hireStart: new Date('2026-07-01T00:00:00.000Z'),
  hireEnd: new Date('2026-08-01T00:00:00.000Z'),
  taskTypes: ['BACKGROUND'],
  status: 'PENDING',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  mangaka: { id: 'm1', displayName: 'Mangaka', avatar: null },
  assistant: { id: 'a1', displayName: 'Assistant', avatar: null },
  series: { id: 's1', title: 'Series' }
}

const assignment = {
  id: 'assignment-1',
  mangakaId: 'm1',
  assistantId: 'a1',
  seriesId: null,
  hireStart: new Date('2026-07-01T00:00:00.000Z'),
  hireEnd: new Date('2026-08-01T00:00:00.000Z'),
  assignedTaskTypes: ['BACKGROUND'],
  status: 'ACTIVE',
  terminatedReason: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z')
}

describe('studio mapper', () => {
  it('maps contextual invite fields and strips taskTypes from list items', () => {
    const result = toInviteRes(invite as never)
    expect(result).toMatchObject({ mangaka: invite.mangaka, assistant: invite.assistant, series: invite.series })
    expect(toInviteListItem(invite as never)).not.toHaveProperty('taskTypes')
  })

  it('computes activeNow from ACTIVE status and the hire window', () => {
    expect(isAssignmentActiveNow(assignment as never, now)).toBe(true)
    expect(isAssignmentActiveNow({ ...assignment, status: 'TERMINATED' } as never, now)).toBe(false)
    expect(isAssignmentActiveNow({ ...assignment, hireEnd: null } as never, now)).toBe(false)
  })

  it('maps assignment and strips internal list-only fields', () => {
    const result = toAssignmentRes(assignment as never, now)
    expect(result).toMatchObject({ activeNow: true, seriesId: null, terminatedReason: null })
    const listItem = toAssignmentListItem(assignment as never, now)
    expect(listItem).not.toHaveProperty('assignedTaskTypes')
    expect(listItem).not.toHaveProperty('terminatedReason')
  })
})
