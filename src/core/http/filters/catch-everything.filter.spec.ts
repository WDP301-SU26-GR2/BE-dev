import {
  ArgumentsHost,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  UnprocessableEntityException
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { CatchEverythingFilter } from './catch-everything.filter'

function createHost() {
  const response = {}
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({})
    })
  } as unknown as ArgumentsHost
}

function createFilter() {
  const reply = jest.fn()
  const httpAdapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost
  const filter = new CatchEverythingFilter(httpAdapterHost)
  return { filter, reply }
}

describe('CatchEverythingFilter', () => {
  it('translates a single domain field issue and keeps its stable code', () => {
    const { filter, reply } = createFilter()
    const exception = new UnprocessableEntityException([{ message: 'Error.TasksNotAllApproved', path: 'chapterId' }])

    filter.catch(exception, createHost())

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(422)
    expect(body).toEqual({
      success: false,
      statusCode: 422,
      code: 'Error.TasksNotAllApproved',
      message: 'Còn công việc chưa được duyệt — duyệt hoặc huỷ hết task trước khi nộp',
      errors: [
        {
          code: 'Error.TasksNotAllApproved',
          message: 'Còn công việc chưa được duyệt — duyệt hoặc huỷ hết task trước khi nộp',
          path: 'chapterId'
        }
      ]
    })
  })

  it('uses a generic message when there are multiple field issues', () => {
    const { filter, reply } = createFilter()
    const exception = new UnprocessableEntityException([
      { message: 'Địa chỉ email không hợp lệ', path: 'email' },
      { message: 'Mật khẩu quá ngắn', path: 'password' }
    ])

    filter.catch(exception, createHost())

    const [, body] = reply.mock.calls[0]
    expect(body).toEqual({
      success: false,
      statusCode: 422,
      code: 'Error.ValidationFailed',
      message: 'Dữ liệu không hợp lệ',
      errors: [
        { code: null, message: 'Địa chỉ email không hợp lệ', path: 'email' },
        { code: null, message: 'Mật khẩu quá ngắn', path: 'password' }
      ]
    })
  })

  it('translates a simple domain code without adding errors[]', () => {
    const { filter, reply } = createFilter()

    filter.catch(new ConflictException('Error.SeriesAlreadyClaimed'), createHost())

    const [, body] = reply.mock.calls[0]
    expect(body).toEqual({
      success: false,
      statusCode: 409,
      code: 'Error.SeriesAlreadyClaimed',
      message: 'Series này đã có Editor khác nhận'
    })
  })

  it('falls back to the untranslated code and warns once when the registry misses a code', () => {
    const { filter, reply } = createFilter()
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    filter.catch(new ConflictException('Error.Spec21MissingTranslation'), createHost())
    filter.catch(new ConflictException('Error.Spec21MissingTranslation'), createHost())

    expect(reply.mock.calls[0][1]).toEqual({
      success: false,
      statusCode: 409,
      code: 'Error.Spec21MissingTranslation',
      message: 'Error.Spec21MissingTranslation'
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  // Hình dạng THẬT của rate-limit sau 2026-07-20: không override `code`, filter derive từ `message`.
  it('preserves explicit HttpException metadata such as rate-limit retryAfter', () => {
    const { filter, reply } = createFilter()
    const exception = new HttpException(
      { message: 'Error.OtpRateLimited', retryAfter: 60 },
      HttpStatus.TOO_MANY_REQUESTS
    )

    filter.catch(exception, createHost())

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(429)
    expect(body).toEqual({
      success: false,
      statusCode: 429,
      code: 'Error.OtpRateLimited',
      message: 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
      retryAfter: 60
    })
  })

  // Nhánh `extraCode` của filter vẫn còn (BE-B có thể cần override) — giữ coverage để không rơi vào
  // vùng chết khi production đã thôi dùng.
  it('lets an explicit code override the one derived from message', () => {
    const { filter, reply } = createFilter()
    const exception = new HttpException(
      { message: 'Error.OtpRateLimited', code: 'Error.CustomOverride', retryAfter: 5 },
      HttpStatus.TOO_MANY_REQUESTS
    )

    filter.catch(exception, createHost())

    const [, body] = reply.mock.calls[0]
    expect(body).toMatchObject({ code: 'Error.CustomOverride', retryAfter: 5 })
  })

  it('maps Prisma unique-constraint errors to 409 Conflict', () => {
    const { filter, reply } = createFilter()
    const prismaError = new PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6.19.0' })

    filter.catch(prismaError, createHost())

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(409)
    expect(body).toEqual({
      success: false,
      statusCode: 409,
      code: 'Error.RecordAlreadyExists',
      message: 'Dữ liệu đã tồn tại'
    })
  })

  it('maps unknown errors to 500 without leaking internals', () => {
    const { filter, reply } = createFilter()
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    filter.catch(new Error('boom'), createHost())
    logSpy.mockRestore()

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(500)
    expect(body).toEqual({
      success: false,
      statusCode: 500,
      code: 'Error.Internal',
      message: 'Lỗi hệ thống, vui lòng thử lại'
    })
  })
})
