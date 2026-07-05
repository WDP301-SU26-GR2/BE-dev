import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'

export class PaymentRecordNotFoundException extends NotFoundException {
  constructor() {
    super('PAYMENT_RECORD_NOT_FOUND')
  }
}

export class InvalidStatusForApprovalException extends BadRequestException {
  constructor() {
    super('INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED')
  }
}

export class InvalidStatusForPaymentException extends BadRequestException {
  constructor() {
    super('INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED')
  }
}

export class PaymentAlreadyPaidException extends BadRequestException {
  constructor() {
    super('PAYMENT_ALREADY_PAID_CANNOT_CANCEL')
  }
}

export class ReceiverNotFoundException extends BadRequestException {
  constructor() {
    super('RECEIVER_USER_NOT_FOUND')
  }
}

export class InvalidAmountException extends BadRequestException {
  constructor() {
    super('INVALID_AMOUNT_MUST_BE_GREATER_THAN_0')
  }
}

export class PaymentConditionNotFoundException extends NotFoundException {
  constructor() {
    super('PAYMENT_CONDITION_NOT_FOUND')
  }
}

export class PaymentConditionNotEditableException extends BadRequestException {
  constructor() {
    super('PAYMENT_CONDITION_NOT_EDITABLE_STATUS_ACHIEVED_OR_MISSED')
  }
}

export class ContractNotFoundForPaymentException extends NotFoundException {
  constructor() {
    super('CONTRACT_NOT_FOUND')
  }
}

export class UnauthorizedPaymentConditionEditorException extends ForbiddenException {
  constructor() {
    super('ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS')
  }
}
