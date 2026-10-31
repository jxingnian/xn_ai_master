import { IsString, Length, Matches } from 'class-validator';

/** 提交配对码请求 DTO */
export class PairDeviceDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: '配对码必须是6位数字' })
  pairingCode!: string;
}
