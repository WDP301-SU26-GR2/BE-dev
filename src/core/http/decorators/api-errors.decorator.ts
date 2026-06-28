import { applyDecorators, HttpException } from '@nestjs/common'
import { ApiResponse } from '@nestjs/swagger'
import { ERROR_HINTS } from '../docs/error-docs'

type FieldIssue = { message?: string; path?: string }

const joinIssues = (issues: FieldIssue[]) =>
  issues.map((issue) => (issue.path ? `${issue.message} (${issue.path})` : `${issue.message}`)).join(', ')

export function extractCode(exc: HttpException): string {
  const response = exc.getResponse()
  if (typeof response === 'string') return response
  if (Array.isArray(response)) return joinIssues(response as FieldIssue[])

  const message = (response as { message?: unknown }).message
  if (Array.isArray(message)) return joinIssues(message as FieldIssue[])

  return typeof message === 'string' ? message : exc.message
}

export type ApiErrorSpec = { status: number; description: string }

export function buildApiErrorSpecs(exceptions: HttpException[]): ApiErrorSpec[] {
  const byStatus = new Map<number, string[]>()

  for (const exception of exceptions) {
    const status = exception.getStatus()
    const code = extractCode(exception)
    const bareCode = code.split(' ')[0]
    const hint = ERROR_HINTS[bareCode]
    const text = hint ? `${code} — ${hint}` : code
    const descriptions = byStatus.get(status) ?? []

    if (!descriptions.includes(text)) descriptions.push(text)
    byStatus.set(status, descriptions)
  }

  return [...byStatus.entries()].map(([status, descriptions]) => ({
    status,
    description: descriptions.join(' | ')
  }))
}

export function ApiErrors(...exceptions: HttpException[]) {
  return applyDecorators(...buildApiErrorSpecs(exceptions).map((spec) => ApiResponse(spec)))
}
