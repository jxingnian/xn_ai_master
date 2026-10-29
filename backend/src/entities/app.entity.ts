import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { InstalledApp } from './installed-app.entity';
import { Menu } from './menu.entity';

/** 应用商店中的应用清单，manifest 保存应用声明的权限、菜单和依赖。 */
@Entity('apps')
export class App {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 }) name!: string;
  @Column({ length: 50, unique: true }) code!: string;
  @Column({ length: 20 }) version!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) icon!: string | null;
  @Column({ default: 'published', length: 20 }) status!: string;
  @Column({ type: 'jsonb' }) manifest!: Record<string, unknown>;
  @Column({ name: 'is_system', default: false }) isSystem!: boolean;
  @OneToMany(() => InstalledApp, (item) => item.app) installedApps!: InstalledApp[];
  @OneToMany(() => Menu, (menu) => menu.app) menus!: Menu[];
}
