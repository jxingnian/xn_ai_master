import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { DeviceDevice } from './entities/device-device.entity';
import { DeviceUserBinding } from './entities/device-user-binding.entity';
import { DeviceStatusEvent } from './entities/device-status-event.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { QueryDeviceDto } from './dto/query-device.dto';
import { InstalledApp } from '../../entities/installed-app.entity';
import { MqttConnection } from '../mqtt/entities/mqtt-connection.entity';
import { MqttSubscription } from '../mqtt/entities/mqtt-subscription.entity';
import { MqttService } from '../mqtt/mqtt.service';

/**
 * 凤飞飞设备主服务。
 *
 * 负责设备的增删改查、启用停用和基本管理功能。
 */
@Injectable()
export class FeifeiDeviceService {
  private readonly logger = new Logger(FeifeiDeviceService.name);

  constructor(
    @InjectRepository(DeviceDevice)
    private readonly devices: Repository<DeviceDevice>,
    @InjectRepository(DeviceUserBinding)
    private readonly bindings: Repository<DeviceUserBinding>,
    @InjectRepository(DeviceStatusEvent)
    private readonly statusEvents: Repository<DeviceStatusEvent>,
    @InjectRepository(InstalledApp)
    private readonly installedApps: Repository<InstalledApp>,
    @InjectRepository(MqttConnection)
    private readonly mqttConnections: Repository<MqttConnection>,
    @InjectRepository(MqttSubscription)
    private readonly mqttSubscriptions: Repository<MqttSubscription>,
    private readonly mqttService: MqttService,
  ) {}

  /** 获取凤飞飞应用保存的 MQTT 配置及当前连接状态。 */
  async getMqttConfig(): Promise<Record<string, unknown>> {
    const installed = await this.getInstalledApp();
    const config = installed.config || {};
    const connectionId = Number(config.mqttConnectionId || 0);
    const connection = connectionId > 0 ? await this.mqttConnections.findOne({ where: { id: connectionId } }) : null;
    const status = connection ? (await this.mqttService.status()).find((item) => item.connectionCode === connection.connectionCode) : null;
    return {
      mqttConnectionId: connection?.id || null,
      mqttConnectionCode: connection?.connectionCode || null,
      deviceTopic: String(config.deviceTopic || 'xn/xn_device/#'),
      commandTopic: String(config.commandTopic || 'xn/xn_device/{deviceId}/command'),
      enabled: config.enabled !== false,
      connectionStatus: status?.connected === true ? 'connected' : 'disconnected',
      connectionName: connection?.name || null,
    };
  }

  /** 保存凤飞飞 MQTT 配置，并自动维护设备消息订阅。 */
  async updateMqttConfig(input: { mqttConnectionId: number; deviceTopic?: string; commandTopic?: string; enabled?: boolean }): Promise<Record<string, unknown>> {
    const installed = await this.getInstalledApp();
    const connection = await this.mqttConnections.findOne({ where: { id: input.mqttConnectionId } });
    if (!connection) throw new BadRequestException('选择的 MQTT 连接不存在');
    if (connection.status !== 'enabled') throw new BadRequestException('选择的 MQTT 连接未启用');
    const deviceTopic = input.deviceTopic?.trim() || 'xn/xn_device/#';
    const commandTopic = input.commandTopic?.trim() || 'xn/xn_device/{deviceId}/command';
    if (!deviceTopic.includes('#') && !deviceTopic.includes('+')) throw new BadRequestException('设备订阅主题必须包含 MQTT 通配符');

    const oldSubscriptions = await this.mqttSubscriptions.find({ where: { subscriptionCode: 'feifei-device-subscription' } });
    for (const subscription of oldSubscriptions) {
      subscription.status = 'disabled';
      await this.mqttSubscriptions.save(subscription);
    }
    let subscription = await this.mqttSubscriptions.findOne({ where: { connectionId: connection.id, topicFilter: deviceTopic } });
    if (!subscription) {
      subscription = this.mqttSubscriptions.create({ connectionId: connection.id, subscriptionCode: 'feifei-device-subscription', name: '凤飞飞设备消息', topicFilter: deviceTopic, qos: 1, status: input.enabled === false ? 'disabled' : 'enabled', consumerCode: 'device-manager' });
    } else {
      Object.assign(subscription, { subscriptionCode: 'feifei-device-subscription', name: '凤飞飞设备消息', qos: 1, status: input.enabled === false ? 'disabled' : 'enabled', consumerCode: 'device-manager' });
    }
    await this.mqttSubscriptions.save(subscription);
    installed.config = { ...(installed.config || {}), mqttConnectionId: connection.id, mqttConnectionCode: connection.connectionCode, deviceTopic, commandTopic, enabled: input.enabled !== false };
    await this.installedApps.save(installed);
    await this.mqttService.reconnect(connection.connectionCode);
    return this.getMqttConfig();
  }

  private async getInstalledApp(): Promise<InstalledApp> {
    const app = await this.installedApps.findOne({ where: { app: { code: 'feifei-device' } }, relations: ['app'] });
    if (!app || app.status !== 'enabled') throw new BadRequestException('凤飞飞应用尚未安装或未启用');
    return app;
  }

  /**
   * 查询设备列表。
   *
   * @param query 查询条件
   * @param userId 当前用户ID（用于权限过滤）
   * @returns 设备列表和总数
   */
  async findAll(
    query: QueryDeviceDto,
    userId?: number,
  ): Promise<{ data: Array<Record<string, unknown>>; total: number }> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const queryBuilder = this.devices.createQueryBuilder('device');

    // 关联用户绑定信息
    // 使用实体类建立关联，避免把数据库表名直接交给 TypeORM 实体查询导致 SQL 元数据异常。
    queryBuilder.leftJoin(
      DeviceUserBinding,
      'binding',
      'binding.device_id = device.device_id AND binding.status = :bindingStatus',
      { bindingStatus: 'active' },
    );

    // 权限过滤：用户只能看到自己绑定的设备（管理员可以看到所有设备）
    if (userId) {
      queryBuilder.andWhere('(binding.user_id = :userId OR binding.user_id IS NULL)', { userId });
    }

    // 关键词搜索
    if (query.keyword) {
      queryBuilder.andWhere(
        '(device.device_name LIKE :keyword OR device.device_id LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    // 设备ID筛选
    if (query.deviceId) {
      queryBuilder.andWhere('device.device_id = :deviceId', { deviceId: query.deviceId });
    }

    // 产品编码筛选
    if (query.productCode) {
      queryBuilder.andWhere('device.product_code = :productCode', { productCode: query.productCode });
    }

    // 状态筛选
    if (query.status) {
      queryBuilder.andWhere('device.status = :status', { status: query.status });
    }

    // 绑定状态筛选
    if (query.bindingStatus === 'bound') {
      queryBuilder.andWhere('binding.id IS NOT NULL');
    } else if (query.bindingStatus === 'unbound') {
      queryBuilder.andWhere('binding.id IS NULL');
    }

    // 分页
    queryBuilder.skip((page - 1) * pageSize).take(pageSize);

    // 排序
    // QueryBuilder 使用实体属性名，TypeORM 会自动转换为数据库字段 created_at。
    queryBuilder.orderBy('device.createdAt', 'DESC');

    const [devices, total] = await queryBuilder.getManyAndCount();

    // 查询绑定用户信息
    const deviceIds = devices.map((d) => d.deviceId);
    const bindings = deviceIds.length > 0
      ? await this.bindings.find({
          where: { deviceId: In(deviceIds), status: 'active' },
        })
      : [];

    const bindingMap = new Map<string, DeviceUserBinding>();
    bindings.forEach((b) => bindingMap.set(b.deviceId, b));

    const data = devices.map((device) => {
      const binding = bindingMap.get(device.deviceId);
      return {
        ...device,
        boundUserId: binding?.userId || null,
        boundAt: binding?.boundAt || null,
        isBound: !!binding,
      };
    });

    return { data, total };
  }

  /**
   * 根据ID查询设备详情。
   *
   * @param id 设备ID
   * @returns 设备详情
   */
  async findOne(id: number): Promise<Record<string, unknown>> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    // 查询绑定信息
    const binding = await this.bindings.findOne({
      where: { deviceId: device.deviceId, status: 'active' },
    });

    return {
      ...device,
      boundUserId: binding?.userId || null,
      boundAt: binding?.boundAt || null,
      isBound: !!binding,
    };
  }

  /**
   * 创建设备。
   *
   * @param createDeviceDto 创建设备DTO
   * @returns 创建的设备
   */
  async create(createDeviceDto: CreateDeviceDto): Promise<DeviceDevice> {
    // 检查设备ID是否已存在
    const existing = await this.devices.findOne({ where: { deviceId: createDeviceDto.deviceId } });
    if (existing) {
      throw new BadRequestException('设备ID已存在');
    }

    const device = this.devices.create({
      deviceId: createDeviceDto.deviceId,
      deviceName: createDeviceDto.deviceName,
      productCode: createDeviceDto.productCode || 'xn_device',
      configJson: createDeviceDto.configJson || null,
      status: 'discovered',
    });

    const saved = await this.devices.save(device);
    this.logger.log(`创建设备: ${device.deviceId}`);

    return saved;
  }

  /**
   * 更新设备。
   *
   * @param id 设备ID
   * @param updateDeviceDto 更新设备DTO
   * @returns 更新后的设备
   */
  async update(id: number, updateDeviceDto: UpdateDeviceDto): Promise<DeviceDevice> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    if (updateDeviceDto.deviceName !== undefined) {
      device.deviceName = updateDeviceDto.deviceName;
    }

    if (updateDeviceDto.configJson !== undefined) {
      device.configJson = updateDeviceDto.configJson;
    }

    if (updateDeviceDto.enabled !== undefined) {
      device.enabled = updateDeviceDto.enabled;
    }

    const saved = await this.devices.save(device);
    this.logger.log(`更新设备: ${device.deviceId}`);

    return saved;
  }

  /**
   * 启用设备。
   *
   * @param id 设备ID
   * @returns 操作结果
   */
  async enable(id: number): Promise<{ success: boolean }> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    device.enabled = true;
    if (device.status === 'disabled') {
      device.status = 'offline';
    }

    await this.devices.save(device);
    this.logger.log(`启用设备: ${device.deviceId}`);

    return { success: true };
  }

  /**
   * 停用设备。
   *
   * @param id 设备ID
   * @returns 操作结果
   */
  async disable(id: number): Promise<{ success: boolean }> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    device.enabled = false;
    device.status = 'disabled';

    await this.devices.save(device);
    this.logger.log(`停用设备: ${device.deviceId}`);

    return { success: true };
  }

  /**
   * 删除设备。
   *
   * @param id 设备ID
   * @returns 操作结果
   */
  async remove(id: number): Promise<{ success: boolean }> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    // 检查设备是否有活跃的绑定关系
    const activeBinding = await this.bindings.findOne({
      where: { deviceId: device.deviceId, status: 'active' },
    });

    if (activeBinding) {
      throw new BadRequestException('设备已绑定用户，请先解绑后再删除');
    }

    await this.devices.remove(device);
    this.logger.log(`删除设备: ${device.deviceId}`);

    return { success: true };
  }

  /**
   * 获取设备状态事件。
   *
   * @param deviceId 设备ID
   * @param limit 返回数量限制
   * @returns 状态事件列表
   */
  async getStatusEvents(deviceId: string, limit = 50): Promise<DeviceStatusEvent[]> {
    return await this.statusEvents.find({
      where: { deviceId },
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }
}
