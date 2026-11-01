import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeifeiDeviceStatusService } from './feifei-device-status.service';
import { FeifeiDevicePairingService } from './feifei-device-pairing.service';

/**
 * 凤飞飞设备定时任务服务。
 *
 * 负责：
 * 1. 检查并更新离线设备
 * 2. 清理过期配对码
 */
@Injectable()
export class FeifeiDeviceSchedulerService {
  private readonly logger = new Logger(FeifeiDeviceSchedulerService.name);

  constructor(
    private readonly statusService: FeifeiDeviceStatusService,
    private readonly pairingService: FeifeiDevicePairingService,
  ) {}

  /**
   * 每分钟检查离线设备。
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleOfflineCheck(): Promise<void> {
    try {
      await this.statusService.checkOfflineDevices();
    } catch (error) {
      this.logger.error('检查离线设备失败', error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * 每5分钟清理过期配对码。
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredPairingCodes(): Promise<void> {
    try {
      await this.pairingService.cleanExpiredPairingCodes();
    } catch (error) {
      this.logger.error('清理过期配对码失败', error instanceof Error ? error.stack : String(error));
    }
  }
}
