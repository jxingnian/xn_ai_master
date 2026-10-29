import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { App } from '../../entities/app.entity';
import { InstalledApp } from '../../entities/installed-app.entity';
import { Menu } from '../../entities/menu.entity';

/** 应用生命周期服务，所有状态变化均持久化到 installed_apps。 */
@Injectable()
export class AppManagerService implements OnModuleInit {
  constructor(@InjectRepository(App) private readonly apps: Repository<App>, @InjectRepository(InstalledApp) private readonly installed: Repository<InstalledApp>, @InjectRepository(Menu) private readonly menus: Repository<Menu>) {}

  /** 首次启动写入一个可安装的设备管理示例，便于验证应用商店闭环。 */
  async onModuleInit(): Promise<void> {
    if (await this.apps.count() > 0) return;
    await this.apps.save(this.apps.create({ name: '设备管理', code: 'device-manager', version: '1.0.0', description: '提供设备CRUD及状态监控功能', status: 'published', isSystem: false, manifest: { permissions: ['device:read', 'device:write'], menus: [{ name: '设备管理', path: '/devices', component: 'DeviceList', icon: 'Monitor', sort: 10 }] } }));
  }

  async listStore() { return this.apps.find({ where: { status: 'published' }, order: { name: 'ASC' } }); }
  async listInstalled() { return this.installed.find({ relations: ['app'], order: { installedAt: 'DESC' } }); }

  async install(appId: number) {
    const app = await this.apps.findOne({ where: { id: appId, status: 'published' } });
    if (!app) throw new NotFoundException('应用不存在或未发布');
    const current = await this.installed.findOne({ where: { appId } });
    if (current) throw new BadRequestException('应用已经安装');
    const result = await this.installed.save(this.installed.create({ appId: app.id, version: app.version, status: 'enabled', config: {} }));
    const declaredMenus = (app.manifest?.menus || []) as Array<Record<string, unknown>>;
    if (declaredMenus.length) await this.menus.save(declaredMenus.map((menu) => this.menus.create({ appId: app.id, name: String(menu.name), path: String(menu.path), component: String(menu.component || ''), icon: String(menu.icon || ''), sort: Number(menu.sort || 0), parentId: null })));
    return result;
  }

  async setStatus(appId: number, status: 'enabled' | 'disabled') {
    const item = await this.installed.findOne({ where: { appId } });
    if (!item) throw new NotFoundException('应用尚未安装');
    item.status = status;
    return this.installed.save(item);
  }
}
