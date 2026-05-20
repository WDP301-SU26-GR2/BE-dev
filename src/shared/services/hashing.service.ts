import { Injectable } from '@nestjs/common'
import { compare, hash } from 'bcrypt'
import envConfig from 'src/shared/config/envConfig'

const saltRounds = envConfig.SALT_OR_ROUNDS

@Injectable()
export class HashingService {
  hash(value: string) {
    return hash(value, saltRounds)
  }

  compare(value: string, hash: string) {
    return compare(value, hash)
  }
}
