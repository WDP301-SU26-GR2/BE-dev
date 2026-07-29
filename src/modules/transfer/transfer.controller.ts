import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { ApiObjectIdParams, ObjectIdParamPipe } from 'src/core/http/pipes/object-id-param.pipe'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import type { RoleNameType } from 'src/core/security/constants/role.constant'
import {
  CreateTransferRequestBodyDto,
  BoardDecisionTransferBodyDto,
  CreateTransferContractBodyDto,
  SignTransferContractBodyDto,
  AssignFullBuyoutBodyDto,
  TransferRequestResDto,
  TransferRequestListResDto,
  TransferContractResDto,
  TransferSignatureListResDto
} from './dto/transfer.dto'
import {
  NoActiveContractFoundException,
  TransferRequestNotFoundException,
  InvalidStatusForScreeningException,
  OnlyAppliesToFullBuyoutException,
  OriginalContractIdNotFoundException,
  OnlyAppliesToRevenueShareException,
  RequestNotInNegotiatingStageException,
  TransferContractNotFoundException,
  UserOrEmailNotFoundException,
  UserHasAlreadySignedContractException,
  TransferContractNotFoundAfterUpdateException,
  InvalidTransferStateException,
  ValuationRequiredException,
  TransferAccessDeniedException,
  InvalidTransferBoardDecisionException,
  InvalidTransferProposalException,
  RequesterAlreadyOwnsSeriesException,
  RequestingMangakaInactiveException
} from './errors/transfer.error'
import { TransferService } from './services/transfer.service'
import type { ActorContext } from './transfer.types'

const TransferRequestIdParamPipe = ObjectIdParamPipe.for(() => TransferRequestNotFoundException)
const TransferContractIdParamPipe = ObjectIdParamPipe.for(() => TransferContractNotFoundException)

@ApiTags('transfer')
@ApiBearerAuth()
@Controller('transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  private actor(userId: string, roleName: RoleNameType): ActorContext {
    return { userId, roleName }
  }

  // ---- Transfer Request (B-TRF-01/02) ----
  @Post('requests')
  @ApiOperation({ summary: 'Mangaka B đang hoạt động tạo yêu cầu chuyển nhượng tác phẩm → SUBMITTED' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    NoActiveContractFoundException,
    RequestingMangakaInactiveException,
    RequesterAlreadyOwnsSeriesException,
    InvalidTransferProposalException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  createTransferRequest(@Body() body: CreateTransferRequestBodyDto, @ActiveUser('userId') userId: string) {
    return this.transferService.createTransferRequest(userId, body)
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Danh sách yêu cầu chuyển nhượng của Mangaka hiện tại' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: TransferRequestListResDto })
  getTransferRequestsByMangaka(@ActiveUser('userId') userId: string) {
    return this.transferService.getTransferRequestsByMangaka(userId)
  }

  @Get('requests/pending-board')
  @ApiOperation({ summary: 'Danh sách yêu cầu chuyển nhượng chờ Board xử lý' })
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: TransferRequestListResDto })
  getPendingBoardRequests() {
    return this.transferService.getPendingBoardRequests()
  }

  @Get('requests/:id')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Chi tiết yêu cầu chuyển nhượng' })
  @ApiErrors(TransferRequestNotFoundException, TransferAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: TransferRequestResDto })
  getTransferRequestById(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.getTransferRequestById(id, this.actor(userId, roleName))
  }

  @Post('requests/:id/board-approve')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Board duyệt sàng lọc yêu cầu chuyển nhượng' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TransferRequestNotFoundException,
    InvalidStatusForScreeningException,
    TransferAccessDeniedException,
    InvalidTransferBoardDecisionException
  )
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  boardApproveScreening(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @Body() body: BoardDecisionTransferBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.boardApproveScreening(id, this.actor(userId, roleName), body)
  }

  @Post('requests/:id/board-reject')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Board từ chối sàng lọc yêu cầu chuyển nhượng' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TransferRequestNotFoundException,
    InvalidStatusForScreeningException,
    TransferAccessDeniedException,
    InvalidTransferBoardDecisionException
  )
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  boardRejectScreening(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @Body() body: BoardDecisionTransferBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.boardRejectScreening(id, this.actor(userId, roleName), body)
  }

  @Post('requests/:id/assign-full-buyout')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Board chọn Full Buyout → bàn giao series cho Mangaka B' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TransferRequestNotFoundException,
    OnlyAppliesToFullBuyoutException,
    OriginalContractIdNotFoundException,
    ValuationRequiredException,
    TransferAccessDeniedException,
    InvalidTransferBoardDecisionException
  )
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: MessageResDto })
  boardAssignFullBuyout(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @Body() body: AssignFullBuyoutBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ): Promise<MessageResDto> {
    return this.transferService.boardAssignFullBuyout(id, this.actor(userId, roleName), body)
  }

  // ---- Negotiation & Three-Party Contracts (B-TRF-03) ----
  @Post('requests/:id/start-negotiation')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Editor bắt đầu thương lượng Revenue Share với Mangaka A' })
  @ApiErrors(TransferRequestNotFoundException, OnlyAppliesToRevenueShareException, TransferAccessDeniedException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  startNegotiation(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.startNegotiation(id, this.actor(userId, roleName))
  }

  @Post('requests/:id/mangaka-accept')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Mangaka A đồng ý chuyển nhượng tác phẩm' })
  @ApiErrors(TransferRequestNotFoundException, RequestNotInNegotiatingStageException, TransferAccessDeniedException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  mangakaAcceptTransfer(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.mangakaAcceptTransfer(id, this.actor(userId, roleName))
  }

  @Post('requests/:id/mangaka-reject')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Mangaka A từ chối chuyển nhượng tác phẩm' })
  @ApiErrors(TransferRequestNotFoundException, RequestNotInNegotiatingStageException, TransferAccessDeniedException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: TransferRequestResDto })
  mangakaRejectTransfer(
    @Param('id', TransferRequestIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.mangakaRejectTransfer(id, this.actor(userId, roleName))
  }

  @Post('contracts')
  @ApiOperation({ summary: 'Editor tạo hợp đồng chuyển nhượng 3 bên → DRAFT (chỉ khi request UNDER_REVIEW)' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(TransferRequestNotFoundException, InvalidTransferStateException, TransferAccessDeniedException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: TransferContractResDto })
  createTransferContract(
    @Body() body: CreateTransferContractBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.createTransferContract(this.actor(userId, roleName), body)
  }

  @Post('contracts/:id/sign')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Mangaka/Board ký hợp đồng chuyển nhượng bằng OTP' })
  @ApiResponse({ status: 422, description: 'Validation fail' })
  @ApiErrors(
    TransferContractNotFoundException,
    UserOrEmailNotFoundException,
    UserHasAlreadySignedContractException,
    TransferContractNotFoundAfterUpdateException,
    TransferAccessDeniedException
  )
  @Roles(RoleName.MANGAKA, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: MessageResDto })
  signTransferContract(
    @Param('id', TransferContractIdParamPipe) id: string,
    @Body() body: SignTransferContractBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ): Promise<MessageResDto> {
    return this.transferService.signTransferContract(id, this.actor(userId, roleName), body)
  }

  @Get('contracts/:id')
  @ApiObjectIdParams('id')
  @ApiOperation({
    summary: 'Chi tiết hợp đồng chuyển nhượng (điều khoản + chữ ký) — bên ký đọc trước khi ký'
  })
  @ApiErrors(TransferContractNotFoundException, TransferAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: TransferContractResDto })
  getTransferContractById(
    @Param('id', TransferContractIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.getTransferContractById(id, this.actor(userId, roleName))
  }

  @Get('contracts/:id/signatures')
  @ApiObjectIdParams('id')
  @ApiOperation({ summary: 'Danh sách chữ ký của hợp đồng chuyển nhượng' })
  @ApiErrors(TransferContractNotFoundException, TransferAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: TransferSignatureListResDto })
  getSignatures(
    @Param('id', TransferContractIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: RoleNameType
  ) {
    return this.transferService.getSignatures(id, this.actor(userId, roleName))
  }

  // Co-owner chapter approval (A-CHP-06 / B-TRF-05) đã CHUYỂN sang chapter module (BE-A) —
  // POST /chapters/:id/co-owner-approve | /co-owner-reject (single-writer Manuscript ở chapter). Spec 6.
}
