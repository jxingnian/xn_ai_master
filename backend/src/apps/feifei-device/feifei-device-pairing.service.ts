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

/** 后台唯一负责配对码和绑定状态；设备只接收实时状态，不生成或持久化配对数据。 */
@Injectable()
export class FeifeiDevicePairingService {
  private readonly logger = new Logger(FeifeiDevicePairingService.name);
  private readonly maxFailedAttempts = 5;
  private readonly defaultExpiresInSeconds = 600;

  constructor(
    @InjectRepository(DevicePairingCode) private readonly pairingCodes: Repository<DevicePairingCode>,
    @InjectRepository(DeviceUserBinding) private readonly bindings: Repository<DeviceUserBinding>,
    @InjectRepository(DeviceDevice) private readonly devices: Repository<DeviceDevice>,
    @InjectRepository(InstalledApp) private readonly installedApps: Repository<InstalledApp>,
    private readonly mqttService: MqttService,
    private readonly dataSource: DataSource,
  ) {}

  /** 后台生成配对码；数据库只保存哈希，明文只返回给本次后台调用者。 */
  async generatePairingCodeForDevice(deviceId: string, userId: number, expiresInSeconds = this.defaultExpiresInSeconds): Promise<{ pairingCode: string; expiresAt: Date }> {
    const device = await this.devices.findOne({ where: { deviceId } });
    if (!device) throw new NotFoundException('设备不存在');
    if (await this.bindings.findOne({ where: { deviceId, status: 'active' } })) throw new BadRequestException('设备已经绑定，不能生成配对码');
    await this.pairingCodes.update({ deviceId, status: 'active' }, { status: 'cancelled', updatedAt: new Date() });
    const pairingCode = randomInt(0, 1000000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    await this.pairingCodes.save(this.pairingCodes.create({ deviceId, codeHash: await bcrypt.hash(pairingCode, 10), createdBy: userId, expiresAt, status: 'active' }));
    this.logger.log(`后台生成配对码: 设备=${deviceId}, 创建人=${userId}`);
    return { pairingCode, expiresAt };
  }

  /** 在事务中校验后台配对码、创建唯一绑定并通知设备实时状态。 */
  async pairDeviceByCode(pairingCode: string, userId: number): Promise<{ success: boolean; deviceId: string; deviceName: string; boundAt: Date }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const codes = await manager.find(DevicePairingCode, { where: { status: 'active' }, order: { createdAt: 'DESC' } });
      let matched: DevicePairingCode | null = null;
      for (const code of codes) if (await bcrypt.compare(pairingCode, code.codeHash)) { matched = code; break; }
      if (!matched) throw new BadRequestException('配对码错误');
      if (matched.failedAttempts >= this.maxFailedAttempts) throw new BadRequestException('配对码已锁定，请重新生成');
      if (new Date() > matched.expiresAt) { matched.status = 'expired'; await manager.save(matched); throw new BadRequestException('配对码已过期'); }
      const device = await manager.findOne(DeviceDevice, { where: { deviceId: matched.deviceId } });
      if (!device) throw new NotFoundException('设备不存在');
      if (device.status !== 'online' && device.status !== 'discovered') throw new BadRequestException('设备当前不在线，无法配对');
      const existing = await manager.findOne(DeviceUserBinding, { where: { deviceId: device.deviceId, status: 'active' } });
      if (existing) {
        if (existing.userId !== userId) throw new BadRequestException('设备已被其他用户绑定');
        return { success: true, deviceId: device.deviceId, deviceName: device.deviceName, boundAt: existing.boundAt };
      }
      const binding = manager.create(DeviceUserBinding, { deviceId: device.deviceId, userId, boundAt: new Date(), boundBy: userId, status: 'active' });
      await manager.save(binding);
      matched.status = 'used';
      matched.usedAt = new Date();
      await manager.save(matched);
      return { success: true, deviceId: device.deviceId, deviceName: device.deviceName, boundAt: binding.boundAt };
    });
    await this.notifyDeviceBindingStatus(result.deviceId, true, userId);
    return result;
  }

  /** 向设备发送后台认定的实时绑定状态，设备不保存该状态作为授权依据。 */
  public async notifyDeviceBindingStatus(deviceId: string, bound: boolean, userId?: number): Promise<void> {
    try {
      const app = await this.installedApps.findOne({ where: { app: { code: 'feifei-device' }, status: 'enabled' }, relations: ['app'] });
      const config = app?.config || {};
      const connectionCode = typeof config.mqttConnectionCode === 'string' ? config.mqttConnectionCode : '';
      const commandTopic = typeof config.commandTopic === 'string' ? config.commandTopic.trim() : '';
      if (!connectionCode || !commandTopic) throw new Error('后台未配置设备 MQTT 指令发布参数');
      await this.mqttService.publish({ connectionCode, topic: commandTopic.replace('{deviceId}', deviceId), payload: {
        version: 1, messageId: `binding-status-${Date.now()}-${randomInt(100000, 1000000)}`, type: 'command', deviceId, timestamp: Date.now(),
        data: { commandType: 'binding_status', params: { bound, userId: userId || null } },
      }, qos: 1 });
    } catch (error) {
      this.logger.error(`发送设备绑定状态失败: ${deviceId}`, error instanceof Error ? error.stack : String(error));
    }
  }

  /** 解绑后取消旧码；再次绑定必须重新生成后台配对码。 */
  async unbindDevice(deviceId: string, userId: number): Promise<{ success: boolean }> {
    const binding = await this.bindings.findOne({ where: { deviceId, userId, status: 'active' } });
    if (!binding) throw new NotFoundException('绑定关系不存在');
    binding.status = 'removed';
    binding.unboundAt = new Date();
    await this.bindings.save(binding);
    await this.pairingCodes.update({ deviceId, status: 'active' }, { status: 'cancelled', updatedAt: new Date() });
    await this.notifyDeviceBindingStatus(deviceId, false);
    return { success: true };
  }

  /** 返回配对审计记录，控制器会移除 codeHash。 */
  async getPairingRecords(deviceId: string): Promise<DevicePairingCode[]> {
    return await this.pairingCodes.find({ where: { deviceId }, order: { createdAt: 'DESC' } });
  }

  /** 定时清理过期后台配对码。 */
  async cleanExpiredPairingCodes(): Promise<void> {
    const now = new Date();
    const codes = await this.pairingCodes.find({ where: { status: 'active' } });
    for (const code of codes) if (now > code.expiresAt) { code.status = 'expired'; await this.pairingCodes.save(code); }
  }
}
