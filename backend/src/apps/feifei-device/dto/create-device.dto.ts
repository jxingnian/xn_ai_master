import { IsString, IsOptional, Length, IsObject } from 'class-validator';

/** 创建设备请求 DTO */
export class CreateDeviceDto {
  @IsString()
  @Length(1, 100)
  deviceId!: string;

  @IsString()
  @Length(1, 200)
  deviceName!: string;

  @IsString()
  @IsOptional()
  @Length(1, 50)
  productCode?: string;

  @IsObject()
  @IsOptional()
  configJson?: Record<string, unknown>;
}
