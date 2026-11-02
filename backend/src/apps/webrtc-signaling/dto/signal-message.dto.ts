import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** WebSocket 和 MQTT 共用的信令字段，服务端会进一步校验消息类型与会话状态。 */
export class SignalMessageDto {
  @IsString() @MaxLength(120) messageId!: string;
  @IsString() @MaxLength(80) sessionId!: string;
  @IsString() @MaxLength(80) type!: string;
  @IsInt() @Min(1) sequence!: number;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
