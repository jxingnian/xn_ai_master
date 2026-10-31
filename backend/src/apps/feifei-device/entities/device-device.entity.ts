import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 设备主表实体。
 *
 * 记录设备的基本信息、在线状态、固件版本和配置。
 * 设备首次通过 MQTT 上报状态后自动创建记录，状态为 discovered。
 * 用户绑定关系保存在 DeviceUserBinding 中，支持设备解绑和重新绑定。
 */
@Entity('device_devices')
@Index(['deviceId'])
@Index(['status'])
@Index(['productCode'])
@Index(['lastSeenAt'])
export class DeviceDevice {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 设备唯一 ID，由设备端生成并通过 MQTT 消息上报 */
  @Column({ name: 'device_id', length: 100, unique: true })
  deviceId!: string;

  /** 产品编码，固定为 xn_device */
  @Column({ name: 'product_code', length: 50, default: 'xn_device' })
  productCode!: string;

  /** 设备名称，用户可修改 */
  @Column({ name: 'device_name', length: 200 })
  deviceName!: string;

  /** 设备敏感凭据密文（MQTT密码等），使用应用层加密 */
  @Column({ name: 'device_secret_ciphertext', type: 'text', nullable: true })
  deviceSecretCiphertext!: string | null;

  /** 固件版本，从设备心跳消息中解析 */
  @Column({ name: 'firmware_version', type: 'varchar', length: 50, nullable: true })
  firmwareVersion!: string | null;

  /** 设备状态：discovered=已发现, online=在线, offline=离线, disabled=已停用 */
  @Column({ length: 20, default: 'discovered' })
  status!: 'discovered' | 'online' | 'offline' | 'disabled';

  /** 最后一次收到有效消息的服务端时间，用于在线状态判定 */
  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt!: Date | null;

  /** 最后一次状态变更时间 */
  @Column({ name: 'last_status_at', type: 'timestamp', nullable: true })
  lastStatusAt!: Date | null;

  /** 设备最后上报的 IP 地址 */
  @Column({ name: 'last_ip_address', type: 'varchar', length: 50, nullable: true })
  lastIpAddress!: string | null;

  /** 信号强度，WiFi 设备上报 RSSI */
  @Column({ name: 'signal_strength', type: 'int', nullable: true })
  signalStrength!: number | null;

  /** 设备业务配置，JSON 格式 */
  @Column({ name: 'config_json', type: 'jsonb', nullable: true })
  configJson!: Record<string, unknown> | null;

  /** 是否启用，停用后设备消息被拒绝 */
  @Column({ default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
