import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AuditLog } from '../../../entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(data: {
    userId?: number | null;
    action: string;
    module: string;
    resource?: string | null;
    resourceId?: string | null;
    requestIp?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    result: 'success' | 'failure';
    errorMessage?: string | null;
  }) {
    const log = this.auditLogRepo.create({
      user_id: data.userId ?? null,
      action: data.action,
      module: data.module,
      resource: data.resource ?? null,
      resource_id: data.resourceId ?? null,
      request_ip: data.requestIp ?? null,
      request_method: data.requestMethod ?? null,
      request_path: data.requestPath ?? null,
      result: data.result,
      error_message: data.errorMessage ?? null,
    });
    await this.auditLogRepo.save(log);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    module?: string;
    result?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.startDate && params.endDate) {
      where.created_at = Between(new Date(params.startDate), new Date(params.endDate));
    }

    if (params.module) {
      where.module = params.module;
    }

    if (params.result) {
      where.result = params.result;
    }

    const [items, total] = await this.auditLogRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
