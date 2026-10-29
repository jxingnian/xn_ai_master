import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 管理员用户实体。平台当前只有管理员角色，后续可在此实体上扩展多租户字段。 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 50, unique: true })
  username!: string;

  /** 数据库只保存 bcrypt 哈希，绝不保存明文密码。 */
  @Column({ length: 255 })
  password!: string;

  @Column({ length: 100, nullable: true })
  email!: string | null;

  @Column({ default: 'active', length: 20 })
  status!: string;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
