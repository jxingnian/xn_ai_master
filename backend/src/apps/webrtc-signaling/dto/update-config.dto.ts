import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** STUN/TURN 配置 DTO，密钥仅在管理员主动修改时接收。 */
export class UpdateWebrtcConfigDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsArray() stunUrls!: string[];
  @IsArray() turnUrls!: string[];
  @IsOptional() @IsString() turnUsername?: string;
  @IsOptional() @IsString() turnSecret?: string;
  @IsOptional() @IsIn(['static', 'temporary']) turnCredentialMode?: 'static' | 'temporary';
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(80) productCode?: string;
  @IsOptional() @IsString() @MaxLength(200) commandTopicTemplate?: string;
  @IsOptional() @IsString() @MaxLength(200) signalTopicTemplate?: string;
}
