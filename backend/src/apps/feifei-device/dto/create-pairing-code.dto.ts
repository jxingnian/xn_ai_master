import { IsInt, IsOptional, Min, Max } from 'class-validator';

/** 生成配对码请求 DTO */
export class CreatePairingCodeDto {
  @IsInt()
  @IsOptional()
  @Min(60)
  @Max(3600)
  expiresInSeconds?: number; // 默认 600 秒（10分钟）
}
