import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/require-permission.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../permission/permission.guard';
import { AppManagerService } from './app-manager.service';

/** 应用商店 API；安装、启停都必须经过 JWT 和管理员权限校验。 */
@UseGuards(JwtGuard, PermissionGuard)
@Controller('apps')
export class AppManagerController {
  constructor(private readonly service: AppManagerService) {}
  @Get('store') listStore() { return this.service.listStore(); }
  @Get('installed') listInstalled() { return this.service.listInstalled(); }
  @Post(':id/install') @RequirePermission('app:install') install(@Param('id', ParseIntPipe) id: number) { return this.service.install(id); }
  @Post(':id/status') @RequirePermission('app:manage') setStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: 'enabled' | 'disabled') { return this.service.setStatus(id, status); }
}
