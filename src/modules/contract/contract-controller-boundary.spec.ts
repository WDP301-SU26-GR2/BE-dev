import { METHOD_METADATA, PARAMTYPES_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { ROLES_KEY } from 'src/core/security/decorators/roles.decorator'
import { ContractController } from './contract.controller'
import { PaymentConditionController } from './payment-condition.controller'
import { ContractAmendmentController } from './contract-amendment.controller'

type ControllerClass = abstract new (...args: never[]) => object

function routeMetadata(controller: ControllerClass, methodName: string) {
  const prototype = controller.prototype as Record<string, object>
  const handler = prototype[methodName]
  return {
    prefix: Reflect.getMetadata(PATH_METADATA, controller) as string,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string,
    method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
    roles: Reflect.getMetadata(ROLES_KEY, handler) as string[],
    hasOpenApiResponse: Reflect.getMetadataKeys(handler).some((key) => String(key).includes('swagger'))
  }
}

describe('Contract HTTP controller boundaries', () => {
  const cases: Array<[ControllerClass, string, string, RequestMethod]> = [
    [ContractController, 'health', 'health', RequestMethod.GET],
    [ContractController, 'getContracts', '/', RequestMethod.GET],
    [ContractController, 'exportPdf', ':id/pdf', RequestMethod.GET],
    [ContractController, 'getContractById', ':id', RequestMethod.GET],
    [ContractController, 'getContractVersions', ':id/versions', RequestMethod.GET],
    [ContractController, 'getContractVersionById', ':id/versions/:versionId', RequestMethod.GET],
    [ContractController, 'createDraft', '/', RequestMethod.POST],
    [ContractController, 'updateContract', ':id', RequestMethod.PATCH],
    [ContractController, 'submitReview', ':id/submit-review', RequestMethod.POST],
    [ContractController, 'claim', ':id/claim', RequestMethod.POST],
    [ContractController, 'release', ':id/release', RequestMethod.POST],
    [ContractController, 'assignRepresentative', ':id/assign-representative', RequestMethod.POST],
    [ContractController, 'addComment', ':id/comments', RequestMethod.POST],
    [ContractController, 'listComments', ':id/comments', RequestMethod.GET],
    [ContractController, 'signRepresentative', ':id/sign-representative', RequestMethod.POST],
    [ContractController, 'signMangaka', ':id/sign-mangaka', RequestMethod.POST],
    [ContractController, 'reject', ':id/reject', RequestMethod.POST],
    [ContractController, 'redraft', ':id/redraft', RequestMethod.POST],
    [ContractController, 'reportRevenue', ':id/revenue', RequestMethod.POST],
    [ContractController, 'checkStatus', ':id/status', RequestMethod.GET],
    [PaymentConditionController, 'createPaymentCondition', ':contractId/payment-conditions', RequestMethod.POST],
    [PaymentConditionController, 'getPaymentConditions', ':contractId/payment-conditions', RequestMethod.GET],
    [
      PaymentConditionController,
      'updatePaymentCondition',
      ':contractId/payment-conditions/:conditionId',
      RequestMethod.PATCH
    ],
    [
      PaymentConditionController,
      'disablePaymentCondition',
      ':contractId/payment-conditions/:conditionId/disable',
      RequestMethod.PATCH
    ],
    [ContractAmendmentController, 'createAmendment', ':contractId/amendments', RequestMethod.POST],
    [ContractAmendmentController, 'listAmendments', ':contractId/amendments', RequestMethod.GET],
    [ContractAmendmentController, 'getAmendment', ':contractId/amendments/:id', RequestMethod.GET],
    [ContractAmendmentController, 'updateAmendment', ':contractId/amendments/:id', RequestMethod.PATCH],
    [ContractAmendmentController, 'submitAmendment', ':contractId/amendments/:id/submit', RequestMethod.POST],
    [
      ContractAmendmentController,
      'signAmendmentMangaka',
      ':contractId/amendments/:id/sign/mangaka',
      RequestMethod.POST
    ],
    [ContractAmendmentController, 'signAmendmentBoard', ':contractId/amendments/:id/sign/board', RequestMethod.POST],
    [ContractAmendmentController, 'rejectAmendment', ':contractId/amendments/:id/reject', RequestMethod.POST],
    [ContractAmendmentController, 'voidAmendment', ':contractId/amendments/:id/void', RequestMethod.POST]
  ]

  it.each(cases)('%p.%s preserves contracts/%s', (controller, methodName, path, method) => {
    const metadata = routeMetadata(controller, methodName)
    expect(metadata).toMatchObject({ prefix: 'contracts', path, method, hasOpenApiResponse: true })
    if (methodName !== 'health') expect(metadata.roles).toBeDefined()
  })

  it.each([ContractController, PaymentConditionController, ContractAmendmentController])(
    '%p injects exactly one application facade',
    (controller) => {
      expect(Reflect.getMetadata(PARAMTYPES_METADATA, controller)).toHaveLength(1)
    }
  )
})
