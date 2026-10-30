import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_config')
export class AiConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  base_url!: string | null;

  @Column({ type: 'text' })
  api_key!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature!: number;

  @Column({ type: 'int', default: 2000 })
  max_tokens!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
