import { IsString, IsObject, IsOptional } from 'class-validator';

/** 发送设备指令请求 DTO */
export class SendCommandDto {
  @IsString()
  commandType!: string;

  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;
}
