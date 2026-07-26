import { applyDecorators, Injectable, mixin, PipeTransform, Type } from '@nestjs/common'
import { ApiParam } from '@nestjs/swagger'
import { isObjectId } from '../schemas/object-id.schema'

type ExceptionFactory = () => Error

export const ApiObjectIdParams = (...names: string[]): MethodDecorator =>
  applyDecorators(
    ...names.map((name) =>
      ApiParam({
        name,
        schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', example: '507f1f77bcf86cd799439011' },
        description: 'MongoDB ObjectId (24 hexadecimal characters)'
      })
    )
  )

@Injectable()
export class ObjectIdParamPipe implements PipeTransform<string, string> {
  protected constructor(private readonly exceptionFactory: ExceptionFactory) {}

  static for(exceptionFactory: ExceptionFactory): Type<PipeTransform<string, string>> {
    @Injectable()
    class EntityObjectIdParamPipe extends ObjectIdParamPipe {
      constructor() {
        super(exceptionFactory)
      }
    }

    return mixin(EntityObjectIdParamPipe)
  }

  transform(value: string): string {
    if (!isObjectId(value)) throw this.exceptionFactory()
    return value
  }
}
