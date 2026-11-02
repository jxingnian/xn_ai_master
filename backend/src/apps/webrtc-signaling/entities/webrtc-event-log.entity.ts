import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 信令事件审计表只保存哈希和脱敏摘要，避免把完整 SDP/ICE 长期存入普通日志。 */
@Entity('webrtc_event_log')
@Index(['sessionId', 'messageId'], { unique: true })
@Index(['sessionId', 'sequence', 'direction'])
export class WebrtcEventLog {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'session_id', length: 80 }) sessionId!: string;
  @Column({ name: 'event_id', length: 80, unique: true }) eventId!: string;
  // 显式声明数据库字段类型，避免 TypeScript 的联合类型被反射为 Object。
  @Column({ name: 'message_id', type: 'varchar', length: 120, nullable: true }) messageId!: string | null;
  @Column({ length: 20 }) direction!: 'frontend' | 'device' | 'server';
  @Column({ name: 'event_type', length: 80 }) eventType!: string;
  @Column({ type: 'int', default: 0 }) sequence!: number;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64, nullable: true }) payloadHash!: string | null;
  @Column({ name: 'payload_preview', type: 'text', nullable: true }) payloadPreview!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true }) errorCode!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
