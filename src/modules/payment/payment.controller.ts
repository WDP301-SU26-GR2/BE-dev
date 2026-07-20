import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { PaymentService } from './services/payment.service'
import {
  GetPaymentsQueryDto,
  PayPaymentBodyDto,
  CancelPaymentBodyDto,
  PaymentRecordResDto,
  PaymentRecordListResDto
} from './dto/payment.dto'
import {
  PaymentRecordNotFoundException,
  InvalidStatusForApprovalException,
  InvalidStatusForPaymentException,
  PaymentAlreadyPaidException,
  PaymentNotCancellableException,
  PaymentAccessDeniedException
} from './errors/payment.error'

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách payment toàn hệ thống (filter status/receiver/series/contract/type/source)' })
  @Roles(RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PaymentRecordListResDto })
  getPayments(@Query() query: GetPaymentsQueryDto): Promise<any> {
    return this.paymentService.getPayments(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một payment record (chỉ trong phạm vi sở hữu)' })
  @ApiErrors(new PaymentRecordNotFoundException(), new PaymentAccessDeniedException())
  @Roles(RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN, RoleName.MANGAKA, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: PaymentRecordResDto })
  getPaymentById(
    @Param('id') id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ): Promise<any> {
    return this.paymentService.getPaymentById(id, userId, roleName)
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Board duyệt payment → APPROVED (người duyệt lấy từ token)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(new PaymentRecordNotFoundException(), new InvalidStatusForApprovalException())
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: PaymentRecordResDto })
  approvePayment(@Param('id') id: string, @ActiveUser('userId') userId: string): Promise<any> {
    return this.paymentService.approvePayment(id, userId)
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Board/Admin xác nhận đã thanh toán → PAID' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(new PaymentRecordNotFoundException(), new InvalidStatusForPaymentException())
  @Roles(RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PaymentRecordResDto })
  payPayment(
    @Param('id') id: string,
    @Body() body: PayPaymentBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<any> {
    return this.paymentService.payPayment(id, body, userId)
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Board/Admin hủy payment chưa PAID → CANCELLED' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    new PaymentRecordNotFoundException(),
    new PaymentAlreadyPaidException(),
    new PaymentNotCancellableException()
  )
  @Roles(RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PaymentRecordResDto })
  cancelPayment(
    @Param('id') id: string,
    @Body() body: CancelPaymentBodyDto,
    @ActiveUser('userId') userId: string
  ): Promise<any> {
    return this.paymentService.cancelPayment(id, body, userId)
  }

  @Get('/contracts/:id/payments')
  @ApiOperation({ summary: 'Danh sách payment theo contractId (chỉ trong phạm vi sở hữu)' })
  @ApiErrors(new PaymentAccessDeniedException())
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PaymentRecordListResDto })
  getPaymentsByContract(
    @Param('id') contractId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ): Promise<any> {
    return this.paymentService.getPaymentsByContract(contractId, userId, roleName)
  }

  @Get('/series/:id/payments')
  @ApiOperation({ summary: 'Danh sách payment theo seriesId (chỉ trong phạm vi sở hữu)' })
  @ApiErrors(new PaymentAccessDeniedException())
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PaymentRecordListResDto })
  getPaymentsBySeries(
    @Param('id') seriesId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ): Promise<any> {
    return this.paymentService.getPaymentsBySeries(seriesId, userId, roleName)
  }

  @Get('/users/:id/payments')
  @ApiOperation({ summary: 'Danh sách payment theo receiverId (Mangaka chỉ xem của chính mình)' })
  @ApiErrors(new PaymentAccessDeniedException())
  @Roles(RoleName.MANGAKA, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PaymentRecordListResDto })
  getPaymentsByUser(
    @Param('id') targetUserId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ): Promise<any> {
    return this.paymentService.getPaymentsByUserId(targetUserId, userId, roleName)
  }
}
