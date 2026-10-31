import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 设备配对码实体。
 *
 * 配对码是一次性的，生成后只在创建响应中返回明文，数据库只保存 bcrypt 哈希。
 * 配对码默认有效期 10 分钟，最多使用 1 次。
 * 输入错误累计 5 次后配对码锁定。
 * 同一设备同一时刻只允许一个 status=active 的配对码。
 */
@Entity('device_pairing_codes')
@Index(['deviceId', 'status'])
@Index(['expiresAt'])
export class DevicePairingCode {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 设备 ID */
  @Column({ name: 'device_id', length: 100 })
  deviceId!: string;

  /** 配对码 bcrypt 哈希值，不保存明文 */
  @Column({ name: 'code_hash', length: 255 })
  codeHash!: string;

  /** 创建人 ID */
  @Column({ name: 'created_by', type: 'int' })
  createdBy!: number;

  /** 过期时间，默认生成后 10 分钟 */
  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  /** 使用时间，null 表示尚未使用 */
  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt!: Date | null;

  /** 失败尝试次数，累计 5 次后锁定 */
  @Column({ name: 'failed_attempts', type: 'int', default: 0 })
  failedAttempts!: number;

  /** 配对码状态：active=有效, used=已使用, expired=已过期, locked=已锁定, cancelled=已取消 */
  @Column({ length: 20, default: 'active' })
  status!: 'active' | 'used' | 'expired' | 'locked' | 'cancelled';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
