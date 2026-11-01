import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDefined, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { PermissionGuard } from '../../core/permission/permission.guard';
import { RequirePermission } from '../../common/require-permission.decorator';
import { MqttService } from './mqtt.service';

class ConnectionDto {
  @IsString() @MinLength(2) connectionCode!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['mqtt', 'mqtts', 'ws', 'wss']) protocol?: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  @IsString() host!: string;
  @IsInt() @Min(1) port!: number;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsBoolean() cleanSession?: boolean;
  @IsOptional() @IsInt() @Min(1) keepAlive?: number;
  @IsOptional() @IsInt() @Min(1000) connectTimeout?: number;
  @IsOptional() @IsBoolean() tlsEnabled?: boolean;
  @IsOptional() @IsIn(['enabled', 'disabled']) status?: 'enabled' | 'disabled';
}

class UpdateConnectionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['mqtt', 'mqtts', 'ws', 'wss']) protocol?: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() @Min(1) port?: number;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsInt() @Min(1) keepAlive?: number;
  @IsOptional() @IsInt() @Min(1000) connectTimeout?: number;
  @IsOptional() @IsBoolean() tlsEnabled?: boolean;
  @IsOptional() @IsIn(['enabled', 'disabled']) status?: 'enabled' | 'disabled';
}

class SubscriptionDto {
  @IsInt() @Min(1) connectionId!: number;
  @IsString() subscriptionCode!: string;
  @IsString() name!: string;
  @IsString() topicFilter!: string;
  @IsOptional() @IsIn([0, 1, 2]) qos?: 0 | 1 | 2;
  @IsOptional() @IsString() consumerCode?: string;
  @IsOptional() @IsIn(['enabled', 'disabled']) status?: 'enabled' | 'disabled';
}

class UpdateSubscriptionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() topicFilter?: string;
  @IsOptional() @IsIn([0, 1, 2]) qos?: 0 | 1 | 2;
  @IsOptional() @IsString() consumerCode?: string;
  @IsOptional() @IsIn(['enabled', 'disabled']) status?: 'enabled' | 'disabled';
}

class PublishDto {
  @IsString() connectionCode!: string;
  @IsString() topic!: string;
  @IsDefined() payload!: unknown;
  @IsOptional() @IsIn([0, 1, 2]) qos?: 0 | 1 | 2;
  @IsOptional() @IsBoolean() retain?: boolean;
}

/** MQTT 应用管理接口；所有管理操作都经过管理员 JWT 和细粒度权限校验。 */
@UseGuards(JwtGuard, PermissionGuard)
@Controller('mqtt')
export class MqttController {
  constructor(private readonly mqtt: MqttService) {}

  @Get('connections') @RequirePermission('mqtt:config:read') listConnections() { return this.mqtt.listConnections(); }
  @Post('connections') @RequirePermission('mqtt:config:write') createConnection(@Body() dto: ConnectionDto) { return this.mqtt.createConnection(dto); }
  @Patch('connections/:id') @RequirePermission('mqtt:config:write') updateConnection(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConnectionDto) { return this.mqtt.updateConnection(id, dto); }
  @Delete('connections/:id') @RequirePermission('mqtt:config:write') removeConnection(@Param('id', ParseIntPipe) id: number) { return this.mqtt.removeConnection(id); }
  @Post('connections/:id/test') @RequirePermission('mqtt:config:write') testConnection(@Param('id', ParseIntPipe) id: number) { return this.mqtt.testConnection(id); }
  @Post('connections/:code/reconnect') @RequirePermission('mqtt:config:write') reconnect(@Param('code') code: string) { return this.mqtt.reconnect(code); }

  @Get('subscriptions') @RequirePermission('mqtt:subscription:read') listSubscriptions() { return this.mqtt.listSubscriptions(); }
  @Post('subscriptions') @RequirePermission('mqtt:subscription:write') createSubscription(@Body() dto: SubscriptionDto) { return this.mqtt.createSubscription(dto); }
  @Patch('subscriptions/:id') @RequirePermission('mqtt:subscription:write') updateSubscription(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubscriptionDto) { return this.mqtt.updateSubscription(id, dto); }
  @Delete('subscriptions/:id') @RequirePermission('mqtt:subscription:write') removeSubscription(@Param('id', ParseIntPipe) id: number) { return this.mqtt.removeSubscription(id); }

  @Get('status') @RequirePermission('mqtt:status:read') status() { return this.mqtt.status(); }
  @Get('messages') @RequirePermission('mqtt:message:read') messages(@Query() query: { connectionCode?: string; topic?: string; direction?: 'inbound' | 'outbound'; limit?: number }) { return this.mqtt.listMessages(query); }
  @Post('publish') @RequirePermission('mqtt:message:publish') publish(@Body() dto: PublishDto) { return this.mqtt.publish(dto); }
}
