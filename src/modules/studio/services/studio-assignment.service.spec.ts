import { StudioAssignmentService } from './studio-assignment.service'

function make() {
  const studioRepository = {
    findAssignmentById: jest.fn(),
    findActiveAssignmentForPair: jest.fn(),
    terminateAssignment: jest.fn(),
    listAssignments: jest.fn().mockResolvedValue([]),
    countAssignments: jest.fn().mockResolvedValue(0)
  }
  const notificationService = { notify: jest.fn().mockResolvedValue(undefined) }
  const service = new StudioAssignmentService(studioRepository as never, notificationService as never)
  return { service, studioRepository, notificationService }
}

const baseAssignment = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  mangakaId: 'm1',
  assistantId: 'a1',
  seriesId: null,
  hireStart: new Date('2026-01-01T00:00:00.000Z'),
  hireEnd: new Date('2026-12-31T00:00:00.000Z'),
  assignedTaskTypes: ['BACKGROUND'],
  status: 'ACTIVE',
  terminatedReason: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z')
}

describe('StudioAssignmentService.terminate', () => {
  it('terminates an ACTIVE assignment owned by mangaka', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce(baseAssignment)
    studioRepository.terminateAssignment.mockResolvedValueOnce(1)
    studioRepository.findAssignmentById.mockResolvedValueOnce({
      ...baseAssignment,
      status: 'TERMINATED',
      terminatedReason: 'done'
    })
    const res = await service.terminate('m1', baseAssignment.id, 'done')
    expect(res.status).toBe('TERMINATED')
    expect(studioRepository.terminateAssignment).toHaveBeenCalledWith(baseAssignment.id, 'done')
  })

  it('rejects malformed id with 404', async () => {
    const { service } = make()
    await expect(service.terminate('m1', 'bad-id', 'x')).rejects.toBeDefined()
  })

  it('rejects when caller is not the owner', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce(baseAssignment)
    await expect(service.terminate('other', baseAssignment.id, 'x')).rejects.toBeDefined()
  })

  it('rejects when assignment not ACTIVE (count 0)', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce(baseAssignment)
    studioRepository.terminateAssignment.mockResolvedValueOnce(0)
    await expect(service.terminate('m1', baseAssignment.id, 'x')).rejects.toBeDefined()
  })
})

describe('StudioAssignmentService.findEndedForPairById', () => {
  it('returns null for active assignment within window', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce({
      ...baseAssignment,
      hireEnd: new Date(Date.now() + 86400000)
    })
    const res = await service.findEndedForPairById('m1', 'a1', baseAssignment.id)
    expect(res).toBeNull()
  })

  it('returns assignment when TERMINATED for the pair', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce({ ...baseAssignment, status: 'TERMINATED' })
    const res = await service.findEndedForPairById('m1', 'a1', baseAssignment.id)
    expect(res).not.toBeNull()
  })

  it('returns assignment when ACTIVE but hireEnd passed (lazy ended)', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce({
      ...baseAssignment,
      hireEnd: new Date('2020-01-01T00:00:00.000Z')
    })
    const res = await service.findEndedForPairById('m1', 'a1', baseAssignment.id)
    expect(res).not.toBeNull()
  })

  it('returns null when pair mismatch', async () => {
    const { service, studioRepository } = make()
    studioRepository.findAssignmentById.mockResolvedValueOnce({ ...baseAssignment, status: 'TERMINATED' })
    const res = await service.findEndedForPairById('m1', 'WRONG', baseAssignment.id)
    expect(res).toBeNull()
  })

  it('returns null for malformed id', async () => {
    const { service } = make()
    expect(await service.findEndedForPairById('m1', 'a1', 'bad')).toBeNull()
  })
})
