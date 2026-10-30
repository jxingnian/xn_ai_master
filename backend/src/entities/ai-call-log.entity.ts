import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('ai_call_logs')
@Index(['created_at'])
export class AiCallLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  user_id!: number | null;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'text', nullable: true })
  prompt!: string | null;

  @Column({ type: 'text', nullable: true })
  response!: string | null;

  @Column({ type: 'int', nullable: true })
  prompt_tokens!: number | null;

  @Column({ type: 'int', nullable: true })
  completion_tokens!: number | null;

  @Column({ type: 'int', nullable: true })
  total_tokens!: number | null;

  @Column({ type: 'int', nullable: true })
  response_time_ms!: number | null;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
