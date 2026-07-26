import { Injectable } from '@nestjs/common'

type MetricLabels = Record<string, string>

type CounterSeries = {
  labels: MetricLabels
  value: number
}

type HistogramSeries = {
  labels: MetricLabels
  buckets: number[]
  count: number
  sum: number
}

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const
const AI_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60] as const
const QUEUE_DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60] as const
const QUEUE_AGE_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900, 3600] as const
const CRON_DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900, 3600] as const

@Injectable()
export class RuntimeMetricsService {
  private readonly counters = new Map<string, CounterSeries>()
  private readonly histograms = new Map<string, HistogramSeries>()
  private readonly gauges = new Map<string, CounterSeries>()

  recordHttp(input: { method: string; route: string; statusCode: number; durationSeconds: number }): void {
    const labels = {
      method: this.safeLabel(input.method.toUpperCase()),
      route: this.safeLabel(input.route),
      status_code: String(input.statusCode)
    }
    this.increment('mangaka_http_requests_total', labels)
    this.observe('mangaka_http_request_duration_seconds', labels, input.durationSeconds, HTTP_BUCKETS)
  }

  recordQueueEnqueue(input: {
    queue: string
    job: string
    outcome: 'success' | 'failure'
    retryBudget?: number
  }): void {
    const labels = { queue: this.safeLabel(input.queue), job: this.safeLabel(input.job) }
    this.increment('mangaka_queue_enqueue_total', { ...labels, outcome: input.outcome })
    if (input.retryBudget && input.retryBudget > 0) {
      this.increment('mangaka_queue_retry_budget_total', labels, input.retryBudget)
    }
  }

  recordQueueProcessing(input: {
    queue: string
    job: string
    outcome: 'success' | 'failure' | 'retry'
    durationSeconds: number
    ageSeconds: number
  }): void {
    const labels = { queue: this.safeLabel(input.queue), job: this.safeLabel(input.job) }
    const outcomeLabels = { ...labels, outcome: input.outcome }
    this.increment('mangaka_queue_jobs_total', outcomeLabels)
    this.observe(
      'mangaka_queue_job_duration_seconds',
      outcomeLabels,
      Math.max(0, input.durationSeconds),
      QUEUE_DURATION_BUCKETS
    )
    this.observe('mangaka_queue_job_age_seconds', labels, Math.max(0, input.ageSeconds), QUEUE_AGE_BUCKETS)
  }

  recordQueueDepth(queue: string, counts: Record<'waiting' | 'active' | 'delayed' | 'failed', number>): void {
    for (const [state, value] of Object.entries(counts)) {
      this.setGauge(
        'mangaka_queue_depth',
        { queue: this.safeLabel(queue), state: this.safeLabel(state) },
        Math.max(0, value)
      )
    }
  }

  recordAiInference(input: { operation: 'segment'; outcome: 'success' | 'failure'; durationSeconds: number }): void {
    const labels = { operation: input.operation, outcome: input.outcome }
    this.increment('mangaka_ai_inference_total', labels)
    this.observe('mangaka_ai_inference_duration_seconds', labels, input.durationSeconds, AI_BUCKETS)
  }

  recordSecurityDegraded(control: 'captcha' | 'redis_rate_limit'): void {
    this.increment('mangaka_security_degraded_total', { control })
  }

  recordCron(input: { job: string; outcome: 'success' | 'failure'; durationSeconds: number }): void {
    const labels = { job: this.safeLabel(input.job), outcome: input.outcome }
    this.increment('mangaka_cron_runs_total', labels)
    this.observe('mangaka_cron_duration_seconds', labels, Math.max(0, input.durationSeconds), CRON_DURATION_BUCKETS)
  }

  recordSystem(input: { diskFreeBytes: number; processStartTimeSeconds: number }): void {
    this.setGauge('mangaka_disk_free_bytes', {}, Math.max(0, input.diskFreeBytes))
    this.setGauge('mangaka_process_start_time_seconds', {}, Math.max(0, input.processStartTimeSeconds))
  }

  renderPrometheus(): string {
    const lines: string[] = [
      '# HELP mangaka_http_requests_total Total HTTP requests.',
      '# TYPE mangaka_http_requests_total counter',
      ...this.renderCounters('mangaka_http_requests_total'),
      '# HELP mangaka_http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE mangaka_http_request_duration_seconds histogram',
      ...this.renderHistograms('mangaka_http_request_duration_seconds', HTTP_BUCKETS),
      '# HELP mangaka_queue_enqueue_total Queue enqueue attempts by outcome.',
      '# TYPE mangaka_queue_enqueue_total counter',
      ...this.renderCounters('mangaka_queue_enqueue_total'),
      '# HELP mangaka_queue_retry_budget_total Configured queue retry budget.',
      '# TYPE mangaka_queue_retry_budget_total counter',
      ...this.renderCounters('mangaka_queue_retry_budget_total'),
      '# HELP mangaka_queue_jobs_total Queue processing attempts by outcome.',
      '# TYPE mangaka_queue_jobs_total counter',
      ...this.renderCounters('mangaka_queue_jobs_total'),
      '# HELP mangaka_queue_job_duration_seconds Queue processing duration in seconds.',
      '# TYPE mangaka_queue_job_duration_seconds histogram',
      ...this.renderHistograms('mangaka_queue_job_duration_seconds', QUEUE_DURATION_BUCKETS),
      '# HELP mangaka_queue_job_age_seconds Time from enqueue until processing began, in seconds.',
      '# TYPE mangaka_queue_job_age_seconds histogram',
      ...this.renderHistograms('mangaka_queue_job_age_seconds', QUEUE_AGE_BUCKETS),
      '# HELP mangaka_queue_depth Current BullMQ jobs by queue and state.',
      '# TYPE mangaka_queue_depth gauge',
      ...this.renderGauges('mangaka_queue_depth'),
      '# HELP mangaka_ai_inference_total AI inference attempts by outcome.',
      '# TYPE mangaka_ai_inference_total counter',
      ...this.renderCounters('mangaka_ai_inference_total'),
      '# HELP mangaka_ai_inference_duration_seconds AI inference duration in seconds.',
      '# TYPE mangaka_ai_inference_duration_seconds histogram',
      ...this.renderHistograms('mangaka_ai_inference_duration_seconds', AI_BUCKETS),
      '# HELP mangaka_security_degraded_total Security controls that failed open because a dependency was unavailable.',
      '# TYPE mangaka_security_degraded_total counter',
      ...this.renderCounters('mangaka_security_degraded_total'),
      '# HELP mangaka_cron_runs_total Scheduled job runs by outcome.',
      '# TYPE mangaka_cron_runs_total counter',
      ...this.renderCounters('mangaka_cron_runs_total'),
      '# HELP mangaka_cron_duration_seconds Scheduled job duration in seconds.',
      '# TYPE mangaka_cron_duration_seconds histogram',
      ...this.renderHistograms('mangaka_cron_duration_seconds', CRON_DURATION_BUCKETS),
      '# HELP mangaka_disk_free_bytes Free bytes on the API data filesystem.',
      '# TYPE mangaka_disk_free_bytes gauge',
      ...this.renderGauges('mangaka_disk_free_bytes'),
      '# HELP mangaka_process_start_time_seconds API process start time since the Unix epoch.',
      '# TYPE mangaka_process_start_time_seconds gauge',
      ...this.renderGauges('mangaka_process_start_time_seconds')
    ]
    return `${lines.join('\n')}\n`
  }

  private increment(name: string, labels: MetricLabels, amount = 1): void {
    const key = this.seriesKey(name, labels)
    const current = this.counters.get(key)
    this.counters.set(key, { labels, value: (current?.value ?? 0) + amount })
  }

  private observe(name: string, labels: MetricLabels, value: number, bounds: readonly number[]): void {
    const key = this.seriesKey(name, labels)
    const current = this.histograms.get(key) ?? {
      labels,
      buckets: bounds.map(() => 0),
      count: 0,
      sum: 0
    }
    bounds.forEach((bound, index) => {
      if (value <= bound) current.buckets[index]++
    })
    current.count++
    current.sum += value
    this.histograms.set(key, current)
  }

  private setGauge(name: string, labels: MetricLabels, value: number): void {
    this.gauges.set(this.seriesKey(name, labels), { labels, value })
  }

  private renderCounters(name: string): string[] {
    return [...this.counters.entries()]
      .filter(([key]) => key.startsWith(`${name}|`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, series]) => `${name}${this.renderLabels(series.labels)} ${series.value}`)
  }

  private renderHistograms(name: string, bounds: readonly number[]): string[] {
    return [...this.histograms.entries()]
      .filter(([key]) => key.startsWith(`${name}|`))
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([, series]) => [
        ...bounds.map(
          (bound, index) =>
            `${name}_bucket${this.renderLabels({ ...series.labels, le: String(bound) })} ${series.buckets[index]}`
        ),
        `${name}_bucket${this.renderLabels({ ...series.labels, le: '+Inf' })} ${series.count}`,
        `${name}_sum${this.renderLabels(series.labels)} ${series.sum}`,
        `${name}_count${this.renderLabels(series.labels)} ${series.count}`
      ])
  }

  private renderGauges(name: string): string[] {
    return [...this.gauges.entries()]
      .filter(([key]) => key.startsWith(`${name}|`))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, series]) => `${name}${this.renderLabels(series.labels)} ${series.value}`)
  }

  private seriesKey(name: string, labels: MetricLabels): string {
    return `${name}|${Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(',')}`
  }

  private renderLabels(labels: MetricLabels): string {
    const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right))
    if (entries.length === 0) return ''
    return `{${entries.map(([key, value]) => `${key}="${this.escape(value)}"`).join(',')}}`
  }

  private escape(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
  }

  private safeLabel(value: string): string {
    const normalized = value.trim().slice(0, 160)
    return normalized || 'unknown'
  }
}
