import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { App } from './app.entity';

/** 应用菜单实体；应用停用或卸载时由查询条件统一隐藏。 */
@Entity('menus')
export class Menu {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'app_id' }) appId!: number;
  @ManyToOne(() => App, (app) => app.menus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'app_id' }) app!: App;
  @Column({ length: 50 }) name!: string;
  @Column({ length: 255 }) path!: string;
  @Column({ length: 255, nullable: true }) component!: string | null;
  @Column({ length: 50, nullable: true }) icon!: string | null;
  @Column({ default: 0 }) sort!: number;
  @Column({ name: 'parent_id', nullable: true }) parentId!: number | null;
}
