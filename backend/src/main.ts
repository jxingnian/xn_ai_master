import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthService } from './core/auth/auth.service';
import { DataSource } from 'typeorm';
import { initFeifeiDeviceApp } from './apps/feifei-device/init-feifei-device-app';

/** 启动 HTTP 服务并在启动阶段完成管理员初始化。 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.get(AuthService).ensureAdmin();

  // 初始化凤飞飞设备应用
  const dataSource = app.get(DataSource);
  await initFeifeiDeviceApp(dataSource);

  await app.listen(Number(process.env.PORT || 3000));
}

void bootstrap();
