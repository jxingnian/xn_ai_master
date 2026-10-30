import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttConnection } from './entities/mqtt-connection.entity';
import { MqttMessage } from './entities/mqtt-message.entity';
import { MqttSubscription } from './entities/mqtt-subscription.entity';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { PermissionGuard } from '../../core/permission/permission.guard';

/** MQTT 应用模块：连接管理、订阅管理和发布能力统一从这里对外提供。 */
@Module({
  imports: [TypeOrmModule.forFeature([MqttConnection, MqttSubscription, MqttMessage]), JwtModule.register({ secret: process.env.JWT_SECRET || 'change-this-secret-in-production', signOptions: { expiresIn: '8h' } })],
  controllers: [MqttController],
  providers: [MqttService, JwtGuard, PermissionGuard],
  exports: [MqttService],
})
export class MqttModule {}
