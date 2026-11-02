import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** WebRTC 一对一通话会话。会话状态是服务端唯一可信状态，前端状态不能直接写入数据库。 */
@Entity('webrtc_session')
@Index(['sessionId'], { unique: true })
@Index(['deviceId', 'status'])
@Index(['callerUserId', 'createdAt'])
export class WebrtcSession {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'session_id', length: 80, unique: true }) sessionId!: string;
  @Column({ name: 'device_id', length: 100 }) deviceId!: string;
  @Column({ name: 'caller_user_id', type: 'int' }) callerUserId!: number;
  @Column({ name: 'call_type', length: 20, default: 'audio_video' }) callType!: 'audio' | 'video' | 'audio_video';
  @Column({ length: 20, default: 'created' }) status!: string;
  @Column({ name: 'current_sequence', type: 'int', default: 0 }) currentSequence!: number;
  @Column({ name: 'started_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) startedAt!: Date;
  @Column({ name: 'ringing_at', type: 'timestamp', nullable: true }) ringingAt!: Date | null;
  @Column({ name: 'connected_at', type: 'timestamp', nullable: true }) connectedAt!: Date | null;
  @Column({ name: 'ended_at', type: 'timestamp', nullable: true }) endedAt!: Date | null;
  @Column({ name: 'end_reason', type: 'varchar', length: 100, nullable: true }) endReason!: string | null;
  @Column({ name: 'last_error_code', type: 'varchar', length: 100, nullable: true }) lastErrorCode!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
