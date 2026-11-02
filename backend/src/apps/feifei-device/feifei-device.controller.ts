import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { PermissionGuard } from '../../core/permission/permission.guard';
import { RequirePermission } from '../../common/require-permission.decorator';
import { FeifeiDeviceService } from './feifei-device.service';
import { FeifeiDeviceStatusService } from './feifei-device-status.service';
import { FeifeiDevicePairingService } from './feifei-device-pairing.service';
import { MqttService } from '../mqtt/mqtt.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { QueryDeviceDto } from './dto/query-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { SendCommandDto } from './dto/send-command.dto';
import { DeviceDevice } from './entities/device-device.entity';
import { DeviceStatusEvent } from './entities/device-status-event.entity';

/**
 * 凤飞飞设备应用控制器。
 *
 * 提供设备管理、配对绑定、状态查询和指令发送等 REST API。
 * 所有接口需要 JWT 认证，部分接口需要特定权限。
 */
// main.ts 已统一设置 api 全局前缀，这里只声明业务路径，最终地址为 /api/feifei-devices。
@Controller('feifei-devices')
@UseGuards(JwtGuard, PermissionGuard)
export class FeifeiDeviceController {
  constructor(
    private readonly deviceService: FeifeiDeviceService,
    private readonly statusService: FeifeiDeviceStatusService,
    private readonly pairingService: FeifeiDevicePairingService,
    private readonly mqttService: MqttService,
  ) {}

  /** 返回 MQTT 应用中已有的连接，供凤飞飞应用配置页面选择。 */
  @Get('mqtt-config/connections')
  async listMqttConnections(): Promise<Array<Record<string, unknown>>> {
    return await this.mqttService.status();
  }

  /** 返回凤飞飞应用当前使用的 MQTT 连接配置。 */
  @Get('mqtt-config')
  async getMqttConfig(): Promise<Record<string, unknown>> {
    return await this.deviceService.getMqttConfig();
  }

  /** 保存凤飞飞应用的 MQTT 连接配置并自动重建设备订阅。 */
  @Put('mqtt-config')
  async updateMqttConfig(@Body() body: { mqttConnectionId: number; deviceTopic?: string; commandTopic?: string; enabled?: boolean }): Promise<Record<string, unknown>> {
    return await this.deviceService.updateMqttConfig(body);
  }

  /**
   * 获取设备总览统计。
   *
   * GET /api/feifei-devices/overview
   */
  @Get('overview')
  async getOverview(@Request() req: any): Promise<Record<string, unknown>> {
    // JwtGuard 将 JWT 的管理员 ID 保存在标准 sub 字段中，所有设备接口统一使用该字段。
    const userId = req.user?.sub;
    return await this.statusService.getDeviceStatistics(userId);
  }

  /**
   * 查询设备列表。
   *
   * GET /api/feifei-devices
   */
  @Get()
  async findAll(@Query() query: QueryDeviceDto, @Request() req: any): Promise<Record<string, unknown>> {
    // JwtGuard 将 JWT 的管理员 ID 保存在标准 sub 字段中，所有设备接口统一使用该字段。
    const userId = req.user?.sub;
    return await this.deviceService.findAll(query, userId);
  }

  /**
   * 获取设备详情。
   *
   * GET /api/feifei-devices/:id
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Record<string, unknown>> {
    return await this.deviceService.findOne(id);
  }

  /**
   * 创建设备。
   *
   * POST /api/feifei-devices
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDeviceDto: CreateDeviceDto): Promise<DeviceDevice> {
    return await this.deviceService.create(createDeviceDto);
  }

  /**
   * 更新设备。
   *
   * PATCH /api/feifei-devices/:id
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ): Promise<DeviceDevice> {
    return await this.deviceService.update(id, updateDeviceDto);
  }

  /**
   * 启用设备。
   *
   * POST /api/feifei-devices/:id/enable
   */
  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return await this.deviceService.enable(id);
  }

  /**
   * 停用设备。
   *
   * POST /api/feifei-devices/:id/disable
   */
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return await this.deviceService.disable(id);
  }

  /**
   * 删除设备。
   *
   * DELETE /api/feifei-devices/:id
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return await this.deviceService.remove(id);
  }

  /**
   * 通过配对码绑定设备。
   *
   * POST /api/feifei-devices/pair
   *
   * 用户输入设备上显示的配对码，系统查找对应设备并完成绑定。
   */
  @Post('pair')
  @HttpCode(HttpStatus.OK)
  async pairByCode(
    @Body() dto: PairDeviceDto,
    @Request() req: any,
  ): Promise<{ success: boolean; deviceId: string; deviceName: string; boundAt: Date }> {
    // JWT 载荷使用 sub 表示当前管理员 ID，不能读取不存在的 userId 字段。
    const userId = req.user?.sub;
    return await this.pairingService.pairDeviceByCode(dto.pairingCode, userId);
  }

  /** 由后台生成唯一配对码并通过 MQTT 临时发送给设备展示。 */
  @Post(':id/pairing-codes')
  @RequirePermission('feifei-device:pair')
  @HttpCode(HttpStatus.OK)
  async createPairingCode(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<{ success: boolean; expiresAt: Date }> {
    const device = await this.deviceService.findOne(id);
    const result = await this.statusService.generateAndSendPairingCode(String(device.deviceId), Number(req.user?.sub));
    return { success: true, expiresAt: result.expiresAt };
  }

  /**
   * 解绑设备。
   *
   * POST /api/feifei-devices/:id/unbind
   */
  @Post(':id/unbind')
  @HttpCode(HttpStatus.OK)
  async unbind(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<{ success: boolean }> {
    // JWT 载荷使用 sub 表示当前管理员 ID，解绑时必须使用同一个管理员身份。
    const userId = req.user?.sub;
    const device = await this.deviceService.findOne(id);
    const deviceId = device.deviceId as string;

    return await this.pairingService.unbindDevice(deviceId, userId);
  }

  /**
   * 获取设备配对记录。
   *
   * GET /api/feifei-devices/:id/pairing-records
   */
  @Get(':id/pairing-records')
  async getPairingRecords(@Param('id', ParseIntPipe) id: number): Promise<Record<string, unknown>[]> {
    const device = await this.deviceService.findOne(id);
    const deviceId = device.deviceId as string;

    const records = await this.pairingService.getPairingRecords(deviceId);

    // 脱敏：不返回配对码哈希
    return records.map((record) => {
      const { codeHash, ...safe } = record as any;
      return safe;
    });
  }

  /**
   * 获取设备状态事件。
   *
   * GET /api/feifei-devices/:id/status-events
   */
  @Get(':id/status-events')
  async getStatusEvents(@Param('id', ParseIntPipe) id: number): Promise<DeviceStatusEvent[]> {
    const device = await this.deviceService.findOne(id);
    const deviceId = device.deviceId as string;

    return await this.deviceService.getStatusEvents(deviceId);
  }

  /**
   * 发送设备指令。
   *
   * POST /api/feifei-devices/:id/commands
   *
   * 通过 MQTT 应用发布 command 消息，返回 requestId。
   * HTTP 成功只表示消息已交给 MQTT 应用，设备执行结果由 command_ack 返回。
   */
  @Post(':id/commands')
  @HttpCode(HttpStatus.OK)
  async sendCommand(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendCommandDto,
  ): Promise<{ success: boolean; requestId: string; topic: string }> {
    const device = await this.deviceService.findOne(id);
    const deviceId = device.deviceId as string;

    // 生成请求ID
    const requestId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // 构建指令消息
    const commandMessage = {
      version: 1,
      messageId: requestId,
      type: 'command',
      deviceId,
      timestamp: Date.now(),
      requestId,
      data: {
        commandType: dto.commandType,
        params: dto.params || {},
      },
    };

    // 发布到 MQTT
    const config = await this.deviceService.getMqttConfig();
    if (config.enabled !== true || !config.mqttConnectionCode) {
      throw new BadRequestException('请先在凤飞飞应用的 MQTT 配置中选择并启用连接');
    }
    if (typeof config.commandTopic !== 'string' || !config.commandTopic.trim()) {
      throw new BadRequestException('请先在后台配置指令发布主题');
    }
    const topic = config.commandTopic.trim().replace('{deviceId}', deviceId);
    await this.mqttService.publish({
      connectionCode: String(config.mqttConnectionCode),
      topic,
      payload: commandMessage,
      qos: 1,
    });

    return { success: true, requestId, topic };
  }

  /**
   * 获取应用文档。
   *
   * GET /api/feifei-devices/docs/:documentCode
   */
  @Get('docs/:documentCode')
  async getDocument(@Param('documentCode') documentCode: string): Promise<{ content: string }> {
    // TODO: 根据 documentCode 返回对应的文档内容
    // 文档内容可以存储在数据库或文件中
    const documents: Record<string, string> = {
      'api-access': '# API 接入文档\n\n待完善...',
      'mqtt-config': '# MQTT 配置文档\n\n待完善...',
      'device-connection': '# 设备连接文档\n\n待完善...',
      'pairing-flow': '# 配对绑定流程\n\n待完善...',
      'message-format': '# 消息主题和数据格式\n\n待完善...',
      'security': '# 安全要求\n\n待完善...',
      'troubleshooting': '# 故障排查\n\n待完善...',
    };

    const content = documents[documentCode] || '# 文档未找到';
    return { content };
  }
}
