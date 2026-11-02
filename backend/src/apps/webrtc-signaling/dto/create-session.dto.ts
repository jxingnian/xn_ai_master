import { IsIn, IsString, MaxLength } from 'class-validator';

/** 创建通话时只接受设备业务 ID 和有限的通话类型。 */
export class CreateWebrtcSessionDto {
  @IsString() @MaxLength(100) deviceId!: string;
  @IsIn(['audio', 'video', 'audio_video']) callType!: 'audio' | 'video' | 'audio_video';
}
