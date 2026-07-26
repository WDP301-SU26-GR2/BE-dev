import { RuntimeMetricsService } from './runtime-metrics.service'

describe('RuntimeMetricsService', () => {
  it('renders counters and cumulative histograms in Prometheus text format', () => {
    const service = new RuntimeMetricsService()
    service.recordHttp({ method: 'GET', route: '/series/:id', statusCode: 200, durationSeconds: 0.02 })
    service.recordQueueEnqueue({
      queue: 'ai',
      job: 'segment-page',
      outcome: 'failure',
      retryBudget: 2
    })
    service.recordAiInference({ operation: 'segment', outcome: 'success', durationSeconds: 0.2 })
    service.recordQueueProcessing({
      queue: 'email',
      job: 'send-otp',
      outcome: 'retry',
      durationSeconds: 0.4,
      ageSeconds: 2
    })
    service.recordCron({ job: 'deadline-warning', outcome: 'success', durationSeconds: 0.3 })
    service.recordQueueDepth('notification', { waiting: 3, active: 1, delayed: 2, failed: 0 })
    service.recordSystem({ diskFreeBytes: 10_000, processStartTimeSeconds: 1_000 })

    const text = service.renderPrometheus()

    expect(text).toContain('mangaka_http_requests_total{method="GET",route="/series/:id",status_code="200"} 1')
    expect(text).toContain('mangaka_http_request_duration_seconds_count')
    expect(text).toContain('mangaka_queue_enqueue_total{job="segment-page",outcome="failure",queue="ai"} 1')
    expect(text).toContain('mangaka_queue_retry_budget_total{job="segment-page",queue="ai"} 2')
    expect(text).toContain('mangaka_ai_inference_total{operation="segment",outcome="success"} 1')
    expect(text).toContain('mangaka_queue_jobs_total{job="send-otp",outcome="retry",queue="email"} 1')
    expect(text).toContain('mangaka_queue_job_duration_seconds_count{job="send-otp",outcome="retry",queue="email"} 1')
    expect(text).toContain('mangaka_queue_job_age_seconds_count{job="send-otp",queue="email"} 1')
    expect(text).toContain('mangaka_cron_runs_total{job="deadline-warning",outcome="success"} 1')
    expect(text).toContain('mangaka_cron_duration_seconds_count{job="deadline-warning",outcome="success"} 1')
    expect(text).toContain('mangaka_queue_depth{queue="notification",state="waiting"} 3')
    expect(text).toContain('mangaka_queue_depth{queue="notification",state="failed"} 0')
    expect(text).toContain('mangaka_disk_free_bytes 10000')
    expect(text).toContain('mangaka_process_start_time_seconds 1000')
  })

  it('never accepts or emits identity and IP labels through its typed APIs', () => {
    const service = new RuntimeMetricsService()
    service.recordHttp({ method: 'POST', route: '/vote', statusCode: 200, durationSeconds: 0.01 })

    const text = service.renderPrometheus()
    expect(text).not.toContain('identity')
    expect(text).not.toContain('ip=')
  })

  it('exposes degraded security controls without identity labels', () => {
    const service = new RuntimeMetricsService()
    service.recordSecurityDegraded('captcha')
    service.recordSecurityDegraded('redis_rate_limit')

    const text = service.renderPrometheus()
    expect(text).toContain('mangaka_security_degraded_total{control="captcha"} 1')
    expect(text).toContain('mangaka_security_degraded_total{control="redis_rate_limit"} 1')
  })
})
