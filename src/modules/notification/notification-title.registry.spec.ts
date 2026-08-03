import {
  NOTIFICATION_TITLE_BY_TYPE_VI,
  NOTIFICATION_TITLE_PREFIX_VI,
  NOTIFICATION_TITLE_VI,
  resolveNotificationTitle
} from './notification-title.registry'

describe('Notification title registry (Spec 29)', () => {
  it('contains the complete static title catalog from Appendix B', () => {
    expect(Object.keys(NOTIFICATION_TITLE_VI)).toHaveLength(96)

    const allTitles = [
      ...Object.values(NOTIFICATION_TITLE_VI),
      ...Object.values(NOTIFICATION_TITLE_PREFIX_VI),
      ...Object.values(NOTIFICATION_TITLE_BY_TYPE_VI)
    ]

    expect(allTitles.every((title) => title.trim().length > 0)).toBe(true)
  })

  it('resolves an exact referenceType before any fallback', () => {
    expect(resolveNotificationTitle('TASK_ASSIGNED', 'TASK')).toBe('Công việc mới')
    expect(resolveNotificationTitle('STORYBOARD_APPROVED', 'REVIEW')).toBe('Bản phác thảo được duyệt')
    expect(resolveNotificationTitle('CONTRACT_FULLY_EXECUTED', 'CONTRACT')).toBe('Hợp đồng đã ký kết')
  })

  it('resolves a dynamic referenceType by the prefix before the colon', () => {
    expect(resolveNotificationTitle('DEADLINE_WARNING:2026-08-02', 'DEADLINE')).toBe('Sắp đến hạn nộp')
    expect(resolveNotificationTitle('TASK_DEADLINE_WARNING:2026-08-02', 'DEADLINE')).toBe('Công việc sắp đến hạn')
  })

  it('falls back to the NotificationType title for an unmapped referenceType', () => {
    expect(resolveNotificationTitle('SOMETHING_NEW_NOBODY_MAPPED', 'CONTRACT')).toBe('Hợp đồng')
  })

  it('always returns the generic title when referenceType and type are absent', () => {
    expect(resolveNotificationTitle(null, null)).toBe('Thông báo')
    expect(resolveNotificationTitle('', '')).toBe('Thông báo')
  })

  it('does not use glossary terms that should be translated in titles', () => {
    const forbidden = [/\bseries\b/i, /\bmangaka\b/i, /\bdeadline\b/i, /\beditor\b/i, /\btask\b/i, /\bboard\b/i]
    const titles = [...Object.values(NOTIFICATION_TITLE_VI), ...Object.values(NOTIFICATION_TITLE_PREFIX_VI)]

    expect(titles.filter((title) => forbidden.some((term) => term.test(title)))).toEqual([])
  })
})
