import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DevicePairingCode } from './entities/device-pairing-code.entity';
import { DeviceUserBinding } from './entities/device-user-binding.entity';
import { DeviceDevice } from './entities/device-device.entity';
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
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 生成配对码。
   *
   * @param deviceId 设备ID
   * @param userId 创建人ID
   * @param expiresInSeconds 有效期（秒），默认600秒
   * @returns 包含明文配对码和过期时间的对象
   */
  async generatePairingCode(
    deviceId: string,
    userId: number,
    expiresInSeconds?: number,
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

    // 生成6位数字配对码
    const pairingCode = this.generateSixDigitCode();

    // 计算过期时间
    const expiresAt = new Date(Date.now() + (expiresInSeconds || this.defaultExpiresInSeconds) * 1000);

    // 对配对码进行哈希
    const codeHash = await bcrypt.hash(pairingCode, 10);

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
    return { pairingCode, expiresAt };
  }

  /**
   * 验证配对码并绑定设备。
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
   * 生成6位数字配对码。
   *
   * 使用密码学安全的随机数生成器。
   */
  private generateSixDigitCode(): string {
    const code = randomInt(0, 1000000);
    return code.toString().padStart(6, '0');
  }
}
