import { CreateDateColumn, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** MQTT 消息审计记录，只保存预览和摘要，避免高频完整消息挤占业务数据库。 */
@Entity('mqtt_messages')
export class MqttMessage {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ length: 20 }) direction!: 'inbound' | 'outbound';
  @Column({ name: 'connection_code', length: 80 }) connectionCode!: string;
  @Column({ length: 500 }) topic!: string;
  @Column({ type: 'int', default: 0 }) qos!: number;
  @Column({ default: false }) retain!: boolean;
  @Column({ name: 'message_id', type: 'varchar', length: 120, nullable: true }) messageId!: string | null;
  @Column({ name: 'consumer_code', type: 'varchar', length: 100, nullable: true }) consumerCode!: string | null;
  @Column({ length: 20, default: 'success' }) status!: string;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64, nullable: true }) payloadHash!: string | null;
  @Column({ name: 'payload_preview', type: 'text', nullable: true }) payloadPreview!: string | null;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
