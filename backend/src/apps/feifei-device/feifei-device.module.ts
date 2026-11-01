import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { DeviceDevice } from './entities/device-device.entity';
import { DeviceUserBinding } from './entities/device-user-binding.entity';
import { DevicePairingCode } from './entities/device-pairing-code.entity';
import { DeviceStatusEvent } from './entities/device-status-event.entity';
import { FeifeiDeviceController } from './feifei-device.controller';
import { FeifeiDeviceService } from './feifei-device.service';
import { FeifeiDeviceStatusService } from './feifei-device-status.service';
import { FeifeiDevicePairingService } from './feifei-device-pairing.service';
import { FeifeiDeviceMqttConsumer } from './feifei-device-mqtt.consumer';
import { FeifeiDeviceSchedulerService } from './feifei-device-scheduler.service';
import { MqttModule } from '../mqtt/mqtt.module';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { PermissionGuard } from '../../core/permission/permission.guard';
import { InstalledApp } from '../../entities/installed-app.entity';
import { MqttConnection } from '../mqtt/entities/mqtt-connection.entity';
import { MqttSubscription } from '../mqtt/entities/mqtt-subscription.entity';

/**
 * 凤飞飞设备应用模块。
 *
 * 提供设备管理、配对绑定、状态监控和 MQTT 消息处理能力。
 * 依赖 MQTT 应用模块，通过消费者模式接收设备消息。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceDevice,
      DeviceUserBinding,
      DevicePairingCode,
      DeviceStatusEvent,
      InstalledApp,
      MqttConnection,
      MqttSubscription,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
      signOptions: { expiresIn: '8h' },
    }),
    ScheduleModule.forRoot(), // 启用定时任务
    MqttModule, // 导入 MQTT 应用模块
  ],
  controllers: [FeifeiDeviceController],
  providers: [
    FeifeiDeviceService,
    FeifeiDeviceStatusService,
    FeifeiDevicePairingService,
    FeifeiDeviceMqttConsumer,
    FeifeiDeviceSchedulerService,
    JwtGuard,
    PermissionGuard,
  ],
  exports: [
    FeifeiDeviceService,
    FeifeiDeviceStatusService,
    FeifeiDevicePairingService,
  ],
})
export class FeifeiDeviceModule {}
