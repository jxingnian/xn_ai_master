import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { PermissionGuard } from '../../core/permission/permission.guard';
import { MqttModule } from '../mqtt/mqtt.module';
import { DeviceDevice } from '../feifei-device/entities/device-device.entity';
import { WebrtcConfig } from './entities/webrtc-config.entity';
import { WebrtcEventLog } from './entities/webrtc-event-log.entity';
import { WebrtcSession } from './entities/webrtc-session.entity';
import { WebrtcSignalingController } from './webrtc-signaling.controller';
import { WebrtcSignalingGateway } from './webrtc-signaling.gateway';
import { WebrtcSignalingService } from './webrtc-signaling.service';

/** WebRTC 独立应用模块，依赖 MQTT 应用但不直接依赖 MQTT 客户端库。 */
@Module({
  imports: [TypeOrmModule.forFeature([WebrtcSession, WebrtcConfig, WebrtcEventLog, DeviceDevice]), MqttModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'change-this-secret-in-production', signOptions: { expiresIn: '8h' } })],
  controllers: [WebrtcSignalingController],
  providers: [WebrtcSignalingService, WebrtcSignalingGateway, JwtGuard, PermissionGuard],
  exports: [WebrtcSignalingService],
})
export class WebrtcSignalingModule {}
