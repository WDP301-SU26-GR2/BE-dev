import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ApiObjectIdParams, ObjectIdParamPipe } from 'src/core/http/pipes/object-id-param.pipe'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import {
  CreatePaymentConditionBodyDto,
  PaymentConditionListResDto,
  PaymentConditionResDto,
  UpdatePaymentConditionBodyDto
} from '../payment/dto/payment-condition.dto'
import {
  ContractNotFoundForPaymentException,
  PaymentConditionNotEditableException,
  PaymentConditionNotFoundException,
  UnauthorizedPaymentConditionEditorException
} from '../payment/errors/payment.error'
import { PaymentService } from '../payment/services/payment.service'

const ContractIdParamPipe = ObjectIdParamPipe.for(() => new ContractNotFoundForPaymentException())
const PaymentConditionIdParamPipe = ObjectIdParamPipe.for(() => new PaymentConditionNotFoundException())

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class PaymentConditionController {
  constructor(private readonly paymentService: PaymentService) {}

  @ApiOperation({ summary: 'Editor tạo điều kiện thanh toán cho hợp đồng' })
  @Post(':contractId/payment-conditions')
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(new ContractNotFoundForPaymentException(), new UnauthorizedPaymentConditionEditorException())
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: PaymentConditionResDto })
  createPaymentCondition(
    @Param('contractId') contractId: string,
    @ActiveUser('userId') editorId: string,
    @Body() dto: CreatePaymentConditionBodyDto
  ) {
    return this.paymentService.createPaymentCondition(contractId, editorId, dto)
  }

  @ApiOperation({ summary: 'Danh sách điều kiện thanh toán của hợp đồng' })
  @Get(':contractId/payment-conditions')
  @ApiObjectIdParams('contractId')
  @ApiErrors(new ContractNotFoundForPaymentException(), new UnauthorizedPaymentConditionEditorException())
  @Roles(RoleName.EDITOR, RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: PaymentConditionListResDto })
  getPaymentConditions(
    @Param('contractId', ContractIdParamPipe) contractId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.paymentService.getPaymentConditionsByContract(contractId, userId, roleName)
  }

  @ApiOperation({ summary: 'Editor cập nhật điều kiện thanh toán của hợp đồng' })
  @Patch(':contractId/payment-conditions/:conditionId')
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    new ContractNotFoundForPaymentException(),
    new UnauthorizedPaymentConditionEditorException(),
    new PaymentConditionNotFoundException(),
    new PaymentConditionNotEditableException()
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: PaymentConditionResDto })
  updatePaymentCondition(
    @Param('contractId') contractId: string,
    @Param('conditionId') conditionId: string,
    @ActiveUser('userId') editorId: string,
    @Body() dto: UpdatePaymentConditionBodyDto
  ) {
    return this.paymentService.updatePaymentCondition(contractId, conditionId, editorId, dto)
  }

  @ApiOperation({ summary: 'Editor vô hiệu hóa điều kiện thanh toán' })
  @Patch(':contractId/payment-conditions/:conditionId/disable')
  @ApiObjectIdParams('contractId', 'conditionId')
  @ApiErrors(
    new ContractNotFoundForPaymentException(),
    new UnauthorizedPaymentConditionEditorException(),
    new PaymentConditionNotFoundException(),
    new PaymentConditionNotEditableException()
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: PaymentConditionResDto })
  disablePaymentCondition(
    @Param('contractId', ContractIdParamPipe) contractId: string,
    @Param('conditionId', PaymentConditionIdParamPipe) conditionId: string,
    @ActiveUser('userId') editorId: string
  ) {
    return this.paymentService.disablePaymentCondition(contractId, conditionId, editorId)
  }
}
