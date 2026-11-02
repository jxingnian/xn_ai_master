import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { PermissionGuard } from '../../core/permission/permission.guard';
import { RequirePermission } from '../../common/require-permission.decorator';
import { WebrtcSignalingService } from './webrtc-signaling.service';
import { CreateWebrtcSessionDto } from './dto/create-session.dto';
import { UpdateWebrtcConfigDto } from './dto/update-config.dto';

/** WebRTC 管理 API；权限由现有管理员 JWT 和权限守卫统一处理。 */
@Controller('webrtc-signaling')
@UseGuards(JwtGuard, PermissionGuard)
export class WebrtcSignalingController {
  constructor(private readonly service: WebrtcSignalingService) {}
  @Post('sessions') @RequirePermission('webrtc:session:create') create(@Body() dto: CreateWebrtcSessionDto, @Request() req: any) { return this.service.createSession(dto, Number(req.user.sub)); }
  @Get('sessions') @RequirePermission('webrtc:session:read') list(@Query() query: { status?: string; deviceId?: string; limit?: number }) { return this.service.listSessions(query); }
  @Get('sessions/:id/events') @RequirePermission('webrtc:session:read') events(@Param('id') id: string) { return this.service.getEvents(id); }
  @Get('sessions/:id') @RequirePermission('webrtc:session:read') get(@Param('id') id: string) { return this.service.getSession(id); }
  @Post('sessions/:id/terminate') @RequirePermission('webrtc:session:terminate') terminate(@Param('id') id: string, @Body() body: { reason?: string }) { return this.service.terminate(id, body?.reason || 'user_hangup'); }
  @Post('sessions/:id/diagnostics') @RequirePermission('webrtc:session:create') diagnostics(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.recordMediaDiagnostics(id, body); }
  @Get('config') @RequirePermission('webrtc:config:read') config() { return this.service.getConfig(); }
  @Put('config') @RequirePermission('webrtc:config:write') update(@Body() dto: UpdateWebrtcConfigDto) { return this.service.updateConfig(dto); }
  @Get('monitor/summary') @RequirePermission('webrtc:monitor:read') monitor() { return this.service.getMonitor(); }
  @Get('health') @RequirePermission('webrtc:monitor:read') health() { return this.service.getHealth(); }
  @Get('ws-token') @RequirePermission('webrtc:session:create') wsToken(@Request() req: any) { return { wsToken: this.service.issueWsToken(Number(req.user.sub), String(req.user.role || 'admin')), expiresInSeconds: 60 }; }
}
