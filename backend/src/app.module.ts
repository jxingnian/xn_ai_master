import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from './entities/app.entity';
import { InstalledApp } from './entities/installed-app.entity';
import { Menu } from './entities/menu.entity';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AuthController } from './core/auth/auth.controller';
import { AuthService } from './core/auth/auth.service';
import { JwtGuard } from './core/auth/jwt.guard';
import { AppManagerController } from './core/app-manager/app-manager.controller';
import { AppManagerService } from './core/app-manager/app-manager.service';
import { MenuController } from './core/menu/menu.controller';
import { MenuService } from './core/menu/menu.service';
import { PermissionGuard } from './core/permission/permission.guard';
import { SettingsModule } from './platform/settings/settings.module';
import { AuditLogService } from './platform/settings/audit/audit-log.service';
import { MqttModule } from './apps/mqtt/mqtt.module';
import { FeifeiDeviceModule } from './apps/feifei-device/feifei-device.module';
import { WebrtcSignalingModule } from './apps/webrtc-signaling/webrtc-signaling.module';

/** 平台根模块：数据库、认证、应用管理和动态菜单组成首期最小闭环。 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), TypeOrmModule.forRoot({ type: 'postgres', url: process.env.DATABASE_URL || 'postgres://xn_platform:xn_platform@localhost:5432/xn_platform', autoLoadEntities: true, synchronize: true }), TypeOrmModule.forFeature([User, App, InstalledApp, Menu, AuditLog]), JwtModule.register({ secret: process.env.JWT_SECRET || 'change-this-secret-in-production', signOptions: { expiresIn: '8h' } }), SettingsModule, MqttModule, FeifeiDeviceModule, WebrtcSignalingModule],
  controllers: [AuthController, AppManagerController, MenuController],
  providers: [AuthService, JwtGuard, PermissionGuard, AppManagerService, MenuService, AuditLogService],
})
export class AppModule {}
