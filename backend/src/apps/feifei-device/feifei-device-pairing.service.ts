import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DevicePairingCode } from './entities/device-pairing-code.entity';
import { DeviceUserBinding } from './entities/device-user-binding.entity';
import { DeviceDevice } from './entities/device-device.entity';
import { InstalledApp } from '../../entities/installed-app.entity';
import { MqttService } from '../mqtt/mqtt.service';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

/**
 * 设备配对服务。
 *
 * 负责配对码的生成、校验和设备绑定。
 * 配对码规则：
 * 1. 6位数字，使用密码学安全随机数生成
 * 2. 只保存 bcrypt 哈希，不保存明文
 * 3. 默认有效期10分钟，最多使用1次
 * 4. 输入错误累计5次后锁定
 * 5. 同一设备同一时刻只允许一个有效配对码
 * 6. 绑定必须在数据库事务中完成
 */
@Injectable()
export class FeifeiDevicePairingService {
  private readonly logger = new Logger(FeifeiDevicePairingService.name);
  private readonly maxFailedAttempts = 5;
  private readonly defaultExpiresInSeconds = 600; // 10分钟

  constructor(
    @InjectRepository(DevicePairingCode)
    private readonly pairingCodes: Repository<DevicePairingCode>,
    @InjectRepository(DeviceUserBinding)
    private readonly bindings: Repository<DeviceUserBinding>,
    @InjectRepository(DeviceDevice)
    private readonly devices: Repository<DeviceDevice>,
    @InjectRepository(InstalledApp)
    private readonly installedApps: Repository<InstalledApp>,
    private readonly mqttService: MqttService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 为设备生成配对码（内部使用）。
   *
   * @param deviceId 设备ID
   * @param userId 创建人ID
   * @param expiresInSeconds 有效期（秒），默认600秒
   * @returns 包含明文配对码和过期时间的对象
   */
  async generatePairingCodeForDevice(
    deviceId: string,
    userId: number,
    expiresInSeconds?: number,
    pairingCode?: string,
  ): Promise<{ pairingCode: string; expiresAt: Date }> {
    // 检查设备是否存在
    const device = await this.devices.findOne({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    // 使旧的配对码失效
    await this.pairingCodes.update(
      { deviceId, status: 'active' },
      { status: 'cancelled', updatedAt: new Date() },
    );

    // 优先使用设备自己生成并持续上报的配对码，确保后台输入的码与设备 NVS 中的码一致。
    // 设备未提供配对码时才由后台生成，兼容没有本地配对码能力的旧设备。
    const effectivePairingCode = pairingCode || this.generateSixDigitCode();
    if (!/^\d{6}$/.test(effectivePairingCode)) {
      throw new BadRequestException('设备配对码必须是6位数字');
    }

    // 计算过期时间
    const expiresAt = new Date(Date.now() + (expiresInSeconds || this.defaultExpiresInSeconds) * 1000);

    // 对配对码进行哈希
    const codeHash = await bcrypt.hash(effectivePairingCode, 10);

    // 保存配对码
    const entity = this.pairingCodes.create({
      deviceId,
      codeHash,
      createdBy: userId,
      expiresAt,
      status: 'active',
    });

    await this.pairingCodes.save(entity);

    this.logger.log(`生成配对码: 设备=${deviceId}, 创建人=${userId}, 过期时间=${expiresAt.toISOString()}`);

    // 只在创建时返回明文配对码
    return { pairingCode: effectivePairingCode, expiresAt };
  }

  /**
   * 同步设备心跳中的配对码。
   *
   * 设备配对码保存在设备 NVS 中，设备重启后可能继续使用旧码，也可能因清除 NVS
   * 生成新码。后台必须在设备未绑定时持续校验并刷新记录，不能只在设备首次入库时处理。
   * 配对记录仍在有效期内且哈希匹配时直接复用，避免每次心跳都创建历史记录。
   */
  async syncPairingCodeFromDevice(deviceId: string, devicePairingCode: string): Promise<void> {
    if (!/^\d{6}$/.test(devicePairingCode)) {
      this.logger.warn(`忽略非法设备配对码: 设备=${deviceId}`);
      return;
    }

    // 已绑定设备不再刷新配对码，避免绑定完成后又产生新的可用配对入口。
    const activeBinding = await this.bindings.findOne({ where: { deviceId, status: 'active' } });
    if (activeBinding) return;

    const activeCode = await this.pairingCodes.findOne({
      where: { deviceId, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    if (activeCode && activeCode.expiresAt > new Date() && await bcrypt.compare(devicePairingCode, activeCode.codeHash)) {
      return;
    }

    await this.generatePairingCodeForDevice(deviceId, 0, undefined, devicePairingCode);
    this.logger.log(`已同步设备配对码: 设备=${deviceId}`);
  }

  /**
   * 通过配对码验证并绑定设备。
   *
   * @param pairingCode 配对码明文
   * @param userId 绑定的用户ID
   * @returns 绑定结果
   */
  async pairDeviceByCode(
    pairingCode: string,
    userId: number,
  ): Promise<{ success: boolean; deviceId: string; deviceName: string; boundAt: Date }> {
    // 在事务中执行配对流程
    const result = await this.dataSource.transaction(async (manager) => {
      // 1. 查找所有有效的配对码
      const activePairingCodes = await manager.find(DevicePairingCode, {
        where: { status: 'active' },
        order: { createdAt: 'DESC' },
      });

      if (activePairingCodes.length === 0) {
        throw new BadRequestException('配对码不存在或已失效');
      }

      // 2. 遍历查找匹配的配对码
      let matchedPairingCode: DevicePairingCode | null = null;
      for (const code of activePairingCodes) {
        const isValid = await bcrypt.compare(pairingCode, code.codeHash);
        if (isValid) {
          matchedPairingCode = code;
          break;
        }
      }

      if (!matchedPairingCode) {
        throw new BadRequestException('配对码错误');
      }

      const pairingCodeEntity = matchedPairingCode;
      const deviceId = pairingCodeEntity.deviceId;

      // 3. 查找设备
      const device = await manager.findOne(DeviceDevice, { where: { deviceId } });
      if (!device) {
        throw new NotFoundException('设备不存在');
      }

      // 4. 检查配对码是否过期
      if (new Date() > pairingCodeEntity.expiresAt) {
        pairingCodeEntity.status = 'expired';
        await manager.save(pairingCodeEntity);
        throw new BadRequestException('配对码已过期');
      }

      // 5. 检查配对码是否已锁定
      if (pairingCodeEntity.failedAttempts >= this.maxFailedAttempts) {
        pairingCodeEntity.status = 'locked';
        await manager.save(pairingCodeEntity);
        throw new BadRequestException('配对码已锁定，请联系管理员');
      }

      // 6. 检查设备是否已被其他用户绑定
      const existingBinding = await manager.findOne(DeviceUserBinding, {
        where: { deviceId, status: 'active' },
      });

      if (existingBinding && existingBinding.userId !== userId) {
        throw new BadRequestException('设备已被其他用户绑定');
      }

      if (existingBinding && existingBinding.userId === userId) {
        // 用户重复绑定同一设备，直接返回成功
        pairingCodeEntity.status = 'used';
        pairingCodeEntity.usedAt = new Date();
        await manager.save(pairingCodeEntity);

        return {
          success: true,
          deviceId,
          deviceName: device.deviceName,
          boundAt: existingBinding.boundAt,
        };
      }

      // 7. 创建绑定关系
      const binding = manager.create(DeviceUserBinding, {
        deviceId,
        userId,
        boundAt: new Date(),
        boundBy: userId,
        status: 'active',
      });

      await manager.save(binding);

      // 8. 标记配对码已使用
      pairingCodeEntity.status = 'used';
      pairingCodeEntity.usedAt = new Date();
      await manager.save(pairingCodeEntity);

      this.logger.log(`设备配对成功: 设备=${deviceId}, 用户=${userId}`);

      return {
        success: true,
        deviceId,
        deviceName: device.deviceName,
        boundAt: binding.boundAt,
      };
    });

    // 数据库事务提交成功后再通知设备，避免数据库回滚而设备提前写入已绑定状态。
    await this.notifyDeviceBound(result.deviceId, userId);
    return result;
  }

  /**
   * 向设备发送绑定成功指令。
   *
   * 设备端收到 commandType=bind_success 后应将绑定状态写入 NVS，重启时即可停止显示配对码。
   * 当前接口沿用设备后台管理组件已有的 command 信封和凤飞飞 MQTT 配置，不写死服务器地址。
   */
  private async notifyDeviceBound(deviceId: string, userId: number): Promise<void> {
    try {
      const app = await this.installedApps.findOne({
        where: { app: { code: 'feifei-device' }, status: 'enabled' },
        relations: ['app'],
      });
      const config = app?.config || {};
      const connectionCode = typeof config.mqttConnectionCode === 'string' ? config.mqttConnectionCode : '';
      if (typeof config.commandTopic !== 'string' || !config.commandTopic.trim()) {
        throw new Error('后台未配置设备指令发布主题');
      }
      const commandTopicTemplate = config.commandTopic.trim();
      if (!connectionCode) {
        this.logger.warn(`设备已绑定但未找到 MQTT 连接配置: ${deviceId}`);
        return;
      }

      await this.mqttService.publish({
        connectionCode,
        topic: commandTopicTemplate.replace('{deviceId}', deviceId),
        payload: {
          version: 1,
          messageId: `bind-${Date.now()}-${randomInt(100000, 1000000)}`,
          type: 'command',
          deviceId,
          timestamp: Date.now(),
          data: {
            commandType: 'bind_success',
            params: { userId },
          },
        },
        qos: 1,
      });
      this.logger.log(`已向设备发送绑定成功指令: ${deviceId}`);
    } catch (error) {
      // 绑定已经落库，发送失败不能回滚绑定；记录明确日志供后续补发或设备重连时处理。
      this.logger.error(`发送设备绑定成功指令失败: ${deviceId}`, error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * 验证配对码并绑定设备（旧方法，保留用于兼容）。
   *
   * @param deviceId 设备ID
   * @param pairingCode 配对码明文
   * @param userId 绑定的用户ID
   * @returns 绑定结果
   */
  async pairDevice(
    deviceId: string,
    pairingCode: string,
    userId: number,
  ): Promise<{ success: boolean; deviceId: string; boundAt: Date }> {
    // 在事务中执行配对流程
    return await this.dataSource.transaction(async (manager) => {
      // 1. 查找设备
      const device = await manager.findOne(DeviceDevice, { where: { deviceId } });
      if (!device) {
        throw new NotFoundException('设备不存在');
      }

      // 2. 检查设备是否在线
      if (device.status !== 'online' && device.status !== 'discovered') {
        throw new BadRequestException('设备当前不在线，无法配对');
      }

      // 3. 查找有效的配对码
      const pairingCodeEntity = await manager.findOne(DevicePairingCode, {
        where: { deviceId, status: 'active' },
        order: { createdAt: 'DESC' },
      });

      if (!pairingCodeEntity) {
        throw new BadRequestException('配对码不存在或已失效');
      }

      // 4. 检查配对码是否过期
      if (new Date() > pairingCodeEntity.expiresAt) {
        pairingCodeEntity.status = 'expired';
        await manager.save(pairingCodeEntity);
        throw new BadRequestException('配对码已过期');
      }

      // 5. 检查配对码是否已锁定
      if (pairingCodeEntity.failedAttempts >= this.maxFailedAttempts) {
        pairingCodeEntity.status = 'locked';
        await manager.save(pairingCodeEntity);
        throw new BadRequestException('配对码已锁定，请重新生成');
      }

      // 6. 验证配对码
      const isValid = await bcrypt.compare(pairingCode, pairingCodeEntity.codeHash);

      if (!isValid) {
        // 增加失败次数
        pairingCodeEntity.failedAttempts += 1;
        if (pairingCodeEntity.failedAttempts >= this.maxFailedAttempts) {
          pairingCodeEntity.status = 'locked';
        }
        await manager.save(pairingCodeEntity);
        throw new BadRequestException(
          `配对码错误，剩余尝试次数: ${this.maxFailedAttempts - pairingCodeEntity.failedAttempts}`,
        );
      }

      // 7. 检查设备是否已被其他用户绑定
      const existingBinding = await manager.findOne(DeviceUserBinding, {
        where: { deviceId, status: 'active' },
      });

      if (existingBinding && existingBinding.userId !== userId) {
        throw new BadRequestException('设备已被其他用户绑定');
      }

      if (existingBinding && existingBinding.userId === userId) {
        // 用户重复绑定同一设备，直接返回成功
        pairingCodeEntity.status = 'used';
        pairingCodeEntity.usedAt = new Date();
        await manager.save(pairingCodeEntity);

        return {
          success: true,
          deviceId,
          boundAt: existingBinding.boundAt,
        };
      }

      // 8. 创建绑定关系
      const binding = manager.create(DeviceUserBinding, {
        deviceId,
        userId,
        boundAt: new Date(),
        boundBy: userId,
        status: 'active',
      });

      await manager.save(binding);

      // 9. 标记配对码已使用
      pairingCodeEntity.status = 'used';
      pairingCodeEntity.usedAt = new Date();
      await manager.save(pairingCodeEntity);

      this.logger.log(`设备配对成功: 设备=${deviceId}, 用户=${userId}`);

      return {
        success: true,
        deviceId,
        boundAt: binding.boundAt,
      };
    });
  }

  /**
   * 解绑设备。
   *
   * @param deviceId 设备ID
   * @param userId 用户ID
   * @returns 解绑结果
   */
  async unbindDevice(deviceId: string, userId: number): Promise<{ success: boolean }> {
    const binding = await this.bindings.findOne({
      where: { deviceId, userId, status: 'active' },
    });

    if (!binding) {
      throw new NotFoundException('绑定关系不存在');
    }

    binding.status = 'removed';
    binding.unboundAt = new Date();
    await this.bindings.save(binding);

    // 设备端配对码保存在 NVS 中，解绑后通常仍会继续使用原配对码。
    // 立即恢复最近一条配对记录并刷新有效期，避免必须等待设备重新上报心跳才能再次绑定。
    const latestPairingCode = await this.pairingCodes.findOne({
      where: { deviceId },
      order: { createdAt: 'DESC' },
    });
    if (latestPairingCode) {
      latestPairingCode.status = 'active';
      latestPairingCode.usedAt = null;
      latestPairingCode.failedAttempts = 0;
      latestPairingCode.expiresAt = new Date(Date.now() + this.defaultExpiresInSeconds * 1000);
      await this.pairingCodes.save(latestPairingCode);
      this.logger.log(`解绑后已恢复配对码有效期: 设备=${deviceId}, 过期时间=${latestPairingCode.expiresAt.toISOString()}`);
    }

    this.logger.log(`设备解绑成功: 设备=${deviceId}, 用户=${userId}`);

    return { success: true };
  }

  /**
   * 获取设备的配对记录。
   *
   * @param deviceId 设备ID
   * @returns 配对记录列表
   */
  async getPairingRecords(deviceId: string): Promise<DevicePairingCode[]> {
    return await this.pairingCodes.find({
      where: { deviceId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 清理过期的配对码。
   *
   * 定时任务调用，将过期的配对码标记为 expired。
   */
  async cleanExpiredPairingCodes(): Promise<void> {
    const now = new Date();
    const expiredCodes = await this.pairingCodes.find({
      where: { status: 'active' },
    });

    let cleanedCount = 0;
    for (const code of expiredCodes) {
      if (now > code.expiresAt) {
        code.status = 'expired';
        await this.pairingCodes.save(code);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`已清理 ${cleanedCount} 个过期配对码`);
    }
  }

  /**
   * 生成6位数字配对码。
   *
   * 使用密码学安全的随机数生成器。
   */
  private generateSixDigitCode(): string {
    const code = randomInt(0, 1000000);
    return code.toString().padStart(6, '0');
  }
}
