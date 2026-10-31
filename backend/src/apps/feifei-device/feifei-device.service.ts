import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { DeviceDevice } from './entities/device-device.entity';
import { DeviceUserBinding } from './entities/device-user-binding.entity';
import { DeviceStatusEvent } from './entities/device-status-event.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { QueryDeviceDto } from './dto/query-device.dto';

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
  ) {}

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
    queryBuilder.leftJoinAndSelect(
      'device_user_bindings',
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
    queryBuilder.orderBy('device.created_at', 'DESC');

    const [devices, total] = await queryBuilder.getManyAndCount();

    // 查询绑定用户信息
    const deviceIds = devices.map((d) => d.deviceId);
    const bindings = await this.bindings.find({
      where: { deviceId: In(deviceIds), status: 'active' },
    });

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
