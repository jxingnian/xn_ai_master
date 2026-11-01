import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MqttService, MqttInboundMessage } from '../mqtt/mqtt.service';
import { FeifeiDeviceStatusService } from './feifei-device-status.service';

/**
 * 凤飞飞设备 MQTT 消费者。
 *
 * 注册到 MQTT 应用，接收设备发送的消息并处理：
 * - status: 设备状态消息
 * - telemetry: 设备遥测数据
 * - event: 设备事件
 * - command_ack: 设备指令应答
 *
 * 消费者编码：device-manager
 */
@Injectable()
export class FeifeiDeviceMqttConsumer implements OnModuleInit {
  private readonly logger = new Logger(FeifeiDeviceMqttConsumer.name);
  private readonly consumerCode = 'device-manager';

  constructor(
    private readonly mqttService: MqttService,
    private readonly statusService: FeifeiDeviceStatusService,
  ) {}

  onModuleInit(): void {
    // 注册到 MQTT 应用作为消费者
    this.mqttService.registerConsumer(this.consumerCode, this.handleMessage.bind(this));
    this.logger.log(`MQTT 消费者已注册: ${this.consumerCode}`);
  }

  /**
   * 处理 MQTT 消息。
   *
   * @param message MQTT 入站消息
   */
  private async handleMessage(message: MqttInboundMessage): Promise<void> {
    try {
      // 解析主题，提取设备ID和消息类型
      // 主题格式由后台 MQTT 订阅配置决定，解析时只要求包含产品、设备和消息类型层级。
      const topicParts = message.topic.split('/');
      // 产品主题的第二段由 MQTT 配置决定，当前设备实际使用 fengfeifei，历史文档使用 xn_device。
      // 这里只校验主题结构，不把某个客户的产品编码写死在消费者中。
      if (topicParts.length !== 4 || topicParts[0] !== 'xn') {
        this.logger.warn(`主题格式不正确: ${message.topic}`);
        return;
      }

      const deviceId = topicParts[2];
      const messageType = topicParts[3];

      // 解析 JSON Payload
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(message.payload);
      } catch (error) {
        this.logger.warn(`消息内容解析失败: ${message.topic}, ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // 校验必填字段
      if (!this.validateMessage(payload, deviceId)) {
        return;
      }

      // 根据消息类型处理
      switch (messageType) {
        case 'status':
        case 'telemetry':
          await this.handleStatusOrTelemetry(deviceId, payload, message.receivedAt);
          break;

        case 'event':
          await this.handleEvent(deviceId, payload, message.receivedAt);
          break;

        case 'command_ack':
          await this.handleCommandAck(deviceId, payload, message.receivedAt);
          break;

        default:
          this.logger.warn(`未知消息类型: ${messageType}`);
      }
    } catch (error) {
      this.logger.error(
        `处理 MQTT 消息失败: ${message.topic}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * 校验消息格式。
   *
   * @param payload 消息内容
   * @param deviceId 设备ID
   * @returns 是否有效
   */
  private validateMessage(payload: Record<string, unknown>, deviceId: string): boolean {
    // 校验版本号
    if (typeof payload.version !== 'number' || payload.version !== 1) {
      this.logger.warn(`消息版本不支持: ${payload.version}`);
      return false;
    }

    // 校验消息ID
    if (!payload.messageId || typeof payload.messageId !== 'string') {
      this.logger.warn('消息缺少 messageId');
      return false;
    }

    // 校验设备ID一致性
    if (payload.deviceId !== deviceId) {
      this.logger.warn(`设备ID不一致: 主题=${deviceId}, Payload=${payload.deviceId}`);
      return false;
    }

    // 校验消息类型
    if (!payload.type || typeof payload.type !== 'string') {
      this.logger.warn('消息缺少 type');
      return false;
    }

    // 限制 Payload 大小（最大 100KB）
    const payloadSize = JSON.stringify(payload).length;
    if (payloadSize > 100 * 1024) {
      this.logger.warn(`消息过大: ${payloadSize} bytes`);
      return false;
    }

    return true;
  }

  /**
   * 处理设备状态或遥测消息。
   *
   * @param deviceId 设备ID
   * @param payload 消息内容
   * @param receivedAt 接收时间
   */
  private async handleStatusOrTelemetry(
    deviceId: string,
    payload: Record<string, unknown>,
    receivedAt: Date,
  ): Promise<void> {
    const messageId = payload.messageId as string;
    const result = await this.statusService.handleStatusMessage(deviceId, messageId, payload, receivedAt);

    if (result.success) {
      this.logger.debug(`设备状态已更新: ${deviceId}`);
    } else if (result.reason === 'duplicate_message') {
      this.logger.debug(`重复消息已忽略: ${messageId}`);
    } else if (result.reason === 'device_disabled') {
      this.logger.warn(`设备已停用，消息被拒绝: ${deviceId}`);
    }
  }

  /**
   * 处理设备事件消息。
   *
   * @param deviceId 设备ID
   * @param payload 消息内容
   * @param receivedAt 接收时间
   */
  private async handleEvent(
    deviceId: string,
    payload: Record<string, unknown>,
    receivedAt: Date,
  ): Promise<void> {
    // 设备事件处理逻辑（告警、故障等）
    const eventType = payload.type;
    this.logger.log(`收到设备事件: 设备=${deviceId}, 类型=${eventType}`);

    // TODO: 根据实际业务需求，可以在此处理告警、通知等逻辑
    // 例如：告警应用可以订阅特定的事件类型
  }

  /**
   * 处理设备指令应答消息。
   *
   * @param deviceId 设备ID
   * @param payload 消息内容
   * @param receivedAt 接收时间
   */
  private async handleCommandAck(
    deviceId: string,
    payload: Record<string, unknown>,
    receivedAt: Date,
  ): Promise<void> {
    const requestId = payload.requestId;
    this.logger.log(`收到指令应答: 设备=${deviceId}, requestId=${requestId}`);

    // TODO: 根据 requestId 关联原始指令，更新指令状态
    // 可以通过 Redis 或数据库记录指令发送记录，并在此处更新执行结果
  }
}
