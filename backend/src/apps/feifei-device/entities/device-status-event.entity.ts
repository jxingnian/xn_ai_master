import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

/**
 * 设备状态事件实体。
 *
 * 记录设备每次状态变更的历史，用于状态追溯和统计分析。
 * message_id 建立唯一索引，防止重复消息产生重复状态事件。
 */
@Entity('device_status_events')
@Index(['deviceId', 'receivedAt'])
@Index(['messageId'], { unique: true })
@Index(['status'])
export class DeviceStatusEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 设备 ID */
  @Column({ name: 'device_id', length: 100 })
  deviceId!: string;

  /** MQTT 消息 ID，用于去重 */
  @Column({ name: 'message_id', length: 100 })
  messageId!: string;

  /** 状态值：discovered, online, offline, disabled */
  @Column({ length: 20 })
  status!: string;

  /** 消息内容的 SHA256 哈希，用于校验和去重 */
  @Column({ name: 'payload_hash', type: 'varchar', length: 64, nullable: true })
  payloadHash!: string | null;

  /** 服务端接收时间，用于在线状态判定 */
  @Column({ name: 'received_at', type: 'timestamp' })
  receivedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
