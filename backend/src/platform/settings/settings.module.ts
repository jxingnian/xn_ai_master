import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtGuard } from '../../core/auth/jwt.guard';
import { AuditLog } from '../../entities/audit-log.entity';
import { AiConfig } from '../../entities/ai-config.entity';
import { AiCallLog } from '../../entities/ai-call-log.entity';
import { SystemController } from './system/system.controller';
import { SystemService } from './system/system.service';
import { AuditLogController } from './audit/audit-log.controller';
import { AuditLogService } from './audit/audit-log.service';
import { AiConfigController } from './ai/ai-config.controller';
import { AiConfigService } from './ai/ai-config.service';

@Module({
  // 设置模块自身包含受保护接口，因此必须在本模块上下文提供 JWT 服务和守卫。
  // 根模块注册的 JwtModule 不会自动跨模块注入，显式注册可避免容器启动时依赖解析失败。
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
      signOptions: { expiresIn: '8h' },
    }),
    TypeOrmModule.forFeature([AuditLog, AiConfig, AiCallLog]),
  ],
  controllers: [SystemController, AuditLogController, AiConfigController],
  providers: [SystemService, AuditLogService, AiConfigService, JwtGuard],
  exports: [AuditLogService],
})
export class SettingsModule {}
