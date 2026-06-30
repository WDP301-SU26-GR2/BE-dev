import { ListNotificationsQuerySchema } from './notification-schemas'

describe('ListNotificationsQuerySchema', () => {
  it('parses isRead=false as boolean false', () => {
    const query = ListNotificationsQuerySchema.parse({ isRead: 'false' })

    expect(query.isRead).toBe(false)
    expect(query.limit).toBe(20)
    expect(query.offset).toBe(0)
  })

  it('keeps isRead undefined when omitted', () => {
    const query = ListNotificationsQuerySchema.parse({})

    expect(query.isRead).toBeUndefined()
  })

  it('rejects invalid boolean query values', () => {
    expect(() => ListNotificationsQuerySchema.parse({ isRead: '0' })).toThrow()
  })
})
