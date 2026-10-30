import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['module', 'created_at'])
@Index(['user_id', 'created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  user_id!: number | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 50 })
  module!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource_id!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  request_ip!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  request_method!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  request_path!: string | null;

  @Column({ type: 'varchar', length: 20 })
  result!: string;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
