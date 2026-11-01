import { Injectable, Logger, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { DeviceDevice } from './entities/device-device.entity';
import { DeviceStatusEvent } from './entities/device-status-event.entity';
import { createHash } from 'crypto';
import { FeifeiDevicePairingService } from './feifei-device-pairing.service';
import { MqttService } from '../mqtt/mqtt.service';
import { InstalledApp } from '../../entities/installed-app.entity';

/**
 * 设备状态服务。
 *
 * 负责设备在线/离线状态判定、状态事件记录和去重。
 * 状态判定规则：
 * 1. 收到设备有效消息后更新为 online
 * 2. last_seen_at + offlineThresholdSeconds < 当前时间，状态变为 offline
 * 3. disabled 设备即使收到消息也不能进入在线状态
 * 4. 使用服务端接收时间 received_at 参与在线判断
 * 5. 重复消息按 message_id 去重
 */
@Injectable()
export class FeifeiDeviceStatusService {
  private readonly logger = new Logger(FeifeiDeviceStatusService.name);
  private readonly offlineThresholdSeconds = 180; // 默认 180 秒离线阈值

  constructor(
    @InjectRepository(DeviceDevice)
    private readonly devices: Repository<DeviceDevice>,
    @InjectRepository(DeviceStatusEvent)
    private readonly statusEvents: Repository<DeviceStatusEvent>,
    @Inject(forwardRef(() => FeifeiDevicePairingService))
    private readonly pairingService: FeifeiDevicePairingService,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
    @InjectRepository(InstalledApp)
    private readonly installedApps: Repository<InstalledApp>,
  ) {}

  /**
   * 处理设备状态或心跳消息。
   *
   * @param deviceId 设备 ID
   * @param messageId 消息 ID，用于去重
   * @param payload 消息内容
   * @param receivedAt 服务端接收时间
   * @returns 处理结果
   */
  async handleStatusMessage(
    deviceId: string,
    messageId: string,
    payload: Record<string, unknown>,
    receivedAt: Date,
  ): Promise<{ success: boolean; reason?: string }> {
    // 检查消息是否已处理（通过 messageId 去重）
    const existingEvent = await this.statusEvents.findOne({ where: { messageId } });
    if (existingEvent) {
      this.logger.debug(`消息已处理，跳过: ${messageId}`);
      return { success: false, reason: 'duplicate_message' };
    }

    // 查找或创建设备记录
    let device = await this.devices.findOne({ where: { deviceId } });

    // 无论设备是否首次入库，都同步未绑定设备心跳中的配对码，修复后台记录过期后无法重新绑定的问题。
    const deviceData = payload.data && typeof payload.data === 'object'
      ? payload.data as Record<string, unknown>
      : {};
    const pairingCode = typeof deviceData.pairingCode === 'string' ? deviceData.pairingCode : undefined;

    if (!device) {
      // 设备首次上线，创建设备记录，状态为 discovered
      device = this.devices.create({
        deviceId,
        deviceName: `设备-${deviceId.slice(-8)}`,
        productCode: 'xn_device',
        status: 'discovered',
        lastSeenAt: receivedAt,
        lastStatusAt: receivedAt,
      });
      await this.devices.save(device);
      this.logger.log(`设备首次上线，已创建设备记录: ${deviceId}`);

      // 设备心跳已携带本地配对码，直接登记该配对码，避免后台生成另一个设备无法识别的码。
      await this.generateAndSendPairingCode(deviceId, pairingCode);
    } else if (pairingCode) {
      await this.pairingService.syncPairingCodeFromDevice(deviceId, pairingCode);
    }

    // 如果设备已停用，拒绝处理并记录
    if (!device.enabled || device.status === 'disabled') {
      await this.recordStatusEvent(deviceId, messageId, 'disabled', payload, receivedAt);
      return { success: false, reason: 'device_disabled' };
    }

    // 更新设备在线状态
    const oldStatus = device.status;
    device.status = 'online';
    device.lastSeenAt = receivedAt;
    device.lastStatusAt = receivedAt;

    // 解析设备消息中的固件版本、IP地址和信号强度
    if (payload.data && typeof payload.data === 'object') {
      const data = payload.data as Record<string, unknown>;
      if (data.firmwareVersion && typeof data.firmwareVersion === 'string') {
        device.firmwareVersion = data.firmwareVersion;
      }
      if (data.ipAddress && typeof data.ipAddress === 'string') {
        device.lastIpAddress = data.ipAddress;
      }
      if (data.signal && typeof data.signal === 'number') {
        device.signalStrength = data.signal;
      }
    }

    await this.devices.save(device);

    // 记录状态事件
    await this.recordStatusEvent(deviceId, messageId, 'online', payload, receivedAt);

    if (oldStatus !== 'online') {
      this.logger.log(`设备状态变更: ${deviceId} ${oldStatus} -> online`);
    }

    return { success: true };
  }

  /**
   * 检查并更新离线设备。
   *
   * 定时任务调用，将超过离线阈值的在线设备标记为离线。
   */
  async checkOfflineDevices(): Promise<void> {
    const thresholdTime = new Date(Date.now() - this.offlineThresholdSeconds * 1000);

    const onlineDevices = await this.devices.find({
      where: {
        status: 'online',
        lastSeenAt: LessThan(thresholdTime),
      },
    });

    for (const device of onlineDevices) {
      device.status = 'offline';
      device.lastStatusAt = new Date();
      await this.devices.save(device);

      // 记录离线事件
      await this.recordStatusEvent(
        device.deviceId,
        `offline-${Date.now()}`,
        'offline',
        { reason: 'timeout' },
        new Date(),
      );

      this.logger.log(`设备离线: ${device.deviceId}`);
    }
  }

  /**
   * 记录设备状态事件。
   *
   * @param deviceId 设备 ID
   * @param messageId 消息 ID
   * @param status 状态
   * @param payload 消息内容
   * @param receivedAt 接收时间
   */
  private async recordStatusEvent(
    deviceId: string,
    messageId: string,
    status: string,
    payload: Record<string, unknown>,
    receivedAt: Date,
  ): Promise<void> {
    const payloadStr = JSON.stringify(payload);
    const payloadHash = createHash('sha256').update(payloadStr).digest('hex');

    const event = this.statusEvents.create({
      deviceId,
      messageId,
      status,
      payloadHash,
      receivedAt,
    });

    try {
      await this.statusEvents.save(event);
    } catch (error) {
      // 唯一索引冲突表示消息已处理，忽略错误
      if (error instanceof Error && error.message.includes('unique')) {
        this.logger.debug(`消息已存在: ${messageId}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * 获取设备状态统计。
   *
   * @param userId 用户 ID（可选，用于权限过滤）
   * @returns 统计数据
   */
  async getDeviceStatistics(userId?: number): Promise<Record<string, unknown>> {
    // 构建查询条件
    const queryBuilder = this.devices.createQueryBuilder('device');

    if (userId) {
      queryBuilder
        .leftJoin('device_user_bindings', 'binding', 'binding.device_id = device.device_id AND binding.status = :bindingStatus', { bindingStatus: 'active' })
        .where('binding.user_id = :userId', { userId });
    }

    // 设备总数
    const totalCount = await queryBuilder.getCount();

    // 在线数量
    const onlineCount = await queryBuilder.clone().andWhere('device.status = :status', { status: 'online' }).getCount();

    // 离线数量
    const offlineCount = totalCount - onlineCount;

    // 未绑定数量
    const unboundQuery = this.devices
      .createQueryBuilder('device')
      .leftJoin('device_user_bindings', 'binding', 'binding.device_id = device.device_id AND binding.status = :bindingStatus', { bindingStatus: 'active' })
      .where('binding.id IS NULL');

    const unboundCount = await unboundQuery.getCount();

    // 今日上线设备数量
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOnlineCount = await queryBuilder
      .clone()
      .andWhere('device.last_seen_at >= :todayStart', { todayStart })
      .getCount();

    return {
      totalCount,
      onlineCount,
      offlineCount,
      unboundCount,
      todayOnlineCount,
    };
  }

  /**
   * 生成配对码并通过MQTT下发给设备。
   *
   * @param deviceId 设备ID
   */
  private async generateAndSendPairingCode(deviceId: string, devicePairingCode?: string): Promise<void> {
    try {
      // 生成配对码（使用系统用户ID 0）
      const result = await this.pairingService.generatePairingCodeForDevice(deviceId, 0, undefined, devicePairingCode);

      this.logger.log(`已为设备 ${deviceId} 生成配对码，过期时间: ${result.expiresAt.toISOString()}`);

      // 设备提供本地配对码时无需下发；只有旧设备没有配对码时才发送兼容消息。
      if (!devicePairingCode) {
        await this.sendPairingCodeToDevice(deviceId, result.pairingCode);
      }
    } catch (error) {
      this.logger.error(`生成并下发配对码失败: ${deviceId}`, error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * 通过MQTT将配对码发送给设备。
   *
   * @param deviceId 设备ID
   * @param pairingCode 配对码
   */
  private async sendPairingCodeToDevice(deviceId: string, pairingCode: string): Promise<void> {
    try {
      // 获取MQTT配置
      const connections = await this.mqttService.status();
      const activeConnection = connections.find((conn: any) => conn.connected === true);

      if (!activeConnection) {
        this.logger.warn(`没有可用的MQTT连接，无法下发配对码给设备: ${deviceId}`);
        return;
      }

      // 构建配对码下发消息
      const message = {
        version: 1,
        messageId: `pairing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'pairing_code',
        deviceId,
        timestamp: Date.now(),
        data: {
          pairingCode,
          expiresInSeconds: 600,
        },
      };

      // 使用凤飞飞应用保存的命令主题配置，保证不同客户和不同产品主题均可工作。
      const topic = (await this.getConfiguredCommandTopic()).replace('{deviceId}', deviceId);
      await this.mqttService.publish({
        connectionCode: String(activeConnection.connectionCode),
        topic,
        payload: message,
        qos: 1,
      });

      this.logger.log(`配对码已下发给设备: ${deviceId}, 主题: ${topic}`);
    } catch (error) {
      this.logger.error(`下发配对码失败: ${deviceId}`, error instanceof Error ? error.stack : String(error));
    }
  }

  /** 读取当前凤飞飞应用的命令主题，旧配置缺失时使用平台默认主题。 */
  private async getConfiguredCommandTopic(): Promise<string> {
    const app = await this.installedApps.findOne({
      where: { app: { code: 'feifei-device' }, status: 'enabled' },
      relations: ['app'],
    });
    const commandTopic = app?.config?.commandTopic;
    if (typeof commandTopic !== 'string' || !commandTopic.trim()) {
      throw new BadRequestException('请先在后台配置设备指令发布主题');
    }
    return commandTopic.trim();
  }
}
