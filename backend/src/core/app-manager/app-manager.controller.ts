import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { Request } from 'express';
import { RequirePermission } from '../../common/require-permission.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../permission/permission.guard';
import { AppManagerService } from './app-manager.service';

/** 应用配置是 JSON 对象，平台只负责持久化，具体字段由应用清单自行解释。 */
class UpdateAppConfigDto {
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class UpdateAppStatusDto {
  @IsString() status!: 'enabled' | 'disabled';
}

/** 应用商店 API；安装、启停都必须经过 JWT 和管理员权限校验。 */
@UseGuards(JwtGuard, PermissionGuard)
@Controller('apps')
export class AppManagerController {
  constructor(private readonly service: AppManagerService) {}
  @Get('store') listStore() { return this.service.listStore(); }
  @Get('installed') listInstalled() { return this.service.listInstalled(); }
  @Post(':id/install') @RequirePermission('app:install') install(@Param('id', ParseIntPipe) id: number, @Req() request: Request) { return this.service.install(id, this.getUserId(request)); }
  @Patch(':id/config') @RequirePermission('app:manage') updateConfig(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAppConfigDto, @Req() request: Request) { return this.service.updateConfig(id, dto.config || {}, this.getUserId(request)); }
  @Post(':id/status') @RequirePermission('app:manage') setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAppStatusDto, @Req() request: Request) { return this.service.setStatus(id, dto.status, this.getUserId(request)); }
  @Post(':id/uninstall') @RequirePermission('app:manage') uninstall(@Param('id', ParseIntPipe) id: number, @Req() request: Request) { return this.service.uninstall(id, this.getUserId(request)); }

  private getUserId(request: Request): number | undefined {
    return (request as Request & { user?: { sub?: number } }).user?.sub;
  }
}
