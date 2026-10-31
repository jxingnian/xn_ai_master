import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 设备与用户绑定关系实体。
 *
 * 一个设备同一时刻只能有一条 status=active 的绑定记录。
 * 解绑时将 status 改为 removed，unbound_at 记录解绑时间，历史记录保留用于审计。
 */
@Entity('device_user_bindings')
@Index(['deviceId', 'status'])
@Index(['userId', 'status'])
@Index(['deviceId', 'userId'], { unique: true, where: "status = 'active'" })
export class DeviceUserBinding {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 设备 ID，关联 device_devices.device_id */
  @Column({ name: 'device_id', length: 100 })
  deviceId!: string;

  /** 用户 ID，关联 users.id */
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  /** 绑定时间 */
  @Column({ name: 'bound_at', type: 'timestamp' })
  boundAt!: Date;

  /** 解绑时间，null 表示当前仍然绑定 */
  @Column({ name: 'unbound_at', type: 'timestamp', nullable: true })
  unboundAt!: Date | null;

  /** 操作人 ID，记录是哪个用户或管理员执行的绑定操作 */
  @Column({ name: 'bound_by', type: 'int' })
  boundBy!: number;

  /** 绑定状态：active=有效绑定, removed=已解绑 */
  @Column({ length: 20, default: 'active' })
  status!: 'active' | 'removed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
