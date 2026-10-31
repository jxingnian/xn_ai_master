import { IsString, IsOptional, Length, IsObject, IsBoolean } from 'class-validator';

/** 更新设备请求 DTO */
export class UpdateDeviceDto {
  @IsString()
  @IsOptional()
  @Length(1, 200)
  deviceName?: string;

  @IsObject()
  @IsOptional()
  configJson?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
