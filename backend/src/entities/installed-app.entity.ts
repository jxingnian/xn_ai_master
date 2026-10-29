import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { App } from './app.entity';

/** 客户实际安装的应用状态；停用只改变状态，不删除配置和历史数据。 */
@Entity('installed_apps')
@Unique(['appId'])
export class InstalledApp {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'app_id' }) appId!: number;
  @ManyToOne(() => App, (app) => app.installedApps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'app_id' }) app!: App;
  @Column({ length: 20 }) version!: string;
  @Column({ default: 'enabled', length: 20 }) status!: string;
  @Column({ type: 'jsonb', nullable: true }) config!: Record<string, unknown> | null;
  @Column({ name: 'installed_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) installedAt!: Date;
}
