import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PaymentMessages } from '../payment.messages'

const E = PaymentMessages.error

export class PaymentRecordNotFoundException extends NotFoundException {
  constructor() {
    super(E.paymentRecordNotFound)
  }
}

export class InvalidStatusForApprovalException extends BadRequestException {
  constructor() {
    super(E.invalidStatusForApproval)
  }
}

export class InvalidStatusForPaymentException extends BadRequestException {
  constructor() {
    super(E.invalidStatusForPayment)
  }
}

export class PaymentAlreadyPaidException extends BadRequestException {
  constructor() {
    super(E.paymentAlreadyPaid)
  }
}

export class ReceiverNotFoundException extends BadRequestException {
  constructor() {
    super(E.receiverNotFound)
  }
}

export class InvalidAmountException extends BadRequestException {
  constructor() {
    super(E.invalidAmount)
  }
}

export class PaymentConditionNotFoundException extends NotFoundException {
  constructor() {
    super(E.paymentConditionNotFound)
  }
}

export class PaymentConditionNotEditableException extends BadRequestException {
  constructor() {
    super(E.paymentConditionNotEditable)
  }
}

export class ContractNotFoundForPaymentException extends NotFoundException {
  constructor() {
    super(E.contractNotFound)
  }
}

export class UnauthorizedPaymentConditionEditorException extends ForbiddenException {
  constructor() {
    super(E.unauthorizedConditionEditor)
  }
}

// S-01: object-level authorization — người gọi không thuộc phạm vi sở hữu payment (receiver/editor/mangaka của contract/series).
export class PaymentAccessDeniedException extends ForbiddenException {
  constructor() {
    super(E.paymentAccessDenied)
  }
}
