import { ERROR_HINTS } from 'src/core/http/docs/error-docs'
import { DecisionAlreadyFinalizedException, RosterSizeTooLargeException } from './board.errors'

describe('DecisionAlreadyFinalizedException (Spec 17)', () => {
  it('uses the stable 409 Error.* contract and has a Swagger hint', () => {
    expect(DecisionAlreadyFinalizedException.getStatus()).toBe(409)
    expect(DecisionAlreadyFinalizedException.getResponse()).toMatchObject({
      statusCode: 409,
      message: [{ message: 'Error.DecisionAlreadyFinalized', path: 'id' }]
    })
    expect(ERROR_HINTS['Error.DecisionAlreadyFinalized']).toBe(
      'decision already APPROVED/REJECTED/EXPIRED — voting closed'
    )
  })
})

describe('RosterSizeTooLargeException', () => {
  it('uses the stable 422 Error.* contract', () => {
    expect(RosterSizeTooLargeException.getStatus()).toBe(422)
    expect(RosterSizeTooLargeException.getResponse()).toMatchObject({
      statusCode: 422,
      message: [{ message: 'Error.RosterSizeTooLarge', path: 'rosterSize' }]
    })
  })
})
