import { CallHandler, ExecutionContext } from '@nestjs/common'
import { firstValueFrom, of } from 'rxjs'
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor'

function run(payload: unknown) {
  const interceptor = new ResponseEnvelopeInterceptor()
  const context = {} as ExecutionContext
  const next: CallHandler = { handle: () => of(payload) }
  return firstValueFrom(interceptor.intercept(context, next))
}

describe('ResponseEnvelopeInterceptor', () => {
  it('lifts a string message and keeps the rest as data', async () => {
    const result = await run({ message: 'Hi', userId: '1' })
    expect(result).toEqual({ success: true, message: 'Hi', data: { userId: '1' } })
  })

  it('returns data=null when the payload only carries a message', async () => {
    const result = await run({ message: 'Done' })
    expect(result).toEqual({ success: true, message: 'Done', data: null })
  })

  it('uses a default message and wraps the whole object as data when there is no message', async () => {
    const result = await run({ accessToken: 'a', refreshToken: 'b' })
    expect(result).toEqual({ success: true, message: 'Success', data: { accessToken: 'a', refreshToken: 'b' } })
  })

  it('wraps arrays as data without treating them as message-carrying objects', async () => {
    const result = await run([1, 2, 3])
    expect(result).toEqual({ success: true, message: 'Success', data: [1, 2, 3] })
  })

  it('normalizes null payloads to data=null', async () => {
    const result = await run(null)
    expect(result).toEqual({ success: true, message: 'Success', data: null })
  })
})
