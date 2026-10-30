import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../../core/auth/jwt.guard';
import { AuditLogService } from './audit-log.service';

@Controller('settings/audit-logs')
@UseGuards(JwtGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('module') module?: string,
    @Query('result') result?: string,
  ) {
    return this.auditLogService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      startDate,
      endDate,
      module,
      result,
    });
  }
}
