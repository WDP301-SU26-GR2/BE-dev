import { Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import {
  ListNotificationsQueryDto,
  NotificationListResDto,
  NotificationResDto,
  ReadAllResDto
} from './dto/notification.dto'
import { NotificationNotFoundException } from './errors/notification.errors'
import { NotificationReadService } from './services/notification-read.service'

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationReadService: NotificationReadService) {}

  @Get()
  @ApiOperation({ summary: 'List thông báo của user hiện tại (filter isRead/type, kèm unreadCount cho badge)' })
  @ZodResponse({ status: 200, type: NotificationListResDto })
  list(@Query() query: ListNotificationsQueryDto, @ActiveUser('userId') userId: string) {
    return this.notificationReadService.list(userId, query)
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo chưa đọc của user là đã đọc' })
  @ZodResponse({ status: 200, type: ReadAllResDto })
  markAllRead(@ActiveUser('userId') userId: string) {
    return this.notificationReadService.markAllRead(userId)
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc (idempotent)' })
  @ApiErrors(NotificationNotFoundException)
  @ZodResponse({ status: 200, type: NotificationResDto })
  markRead(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.notificationReadService.markRead(id, userId)
  }
}
