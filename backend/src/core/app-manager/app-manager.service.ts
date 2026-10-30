import { BadRequestException, Injectable, NotFoundException, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { App } from '../../entities/app.entity';
import { InstalledApp } from '../../entities/installed-app.entity';
import { Menu } from '../../entities/menu.entity';
import { AuditLogService } from '../../platform/settings/audit/audit-log.service';

/** 应用生命周期服务，所有状态变化均持久化到 installed_apps。 */
@Injectable()
export class AppManagerService implements OnModuleInit {
  constructor(
    @InjectRepository(App) private readonly apps: Repository<App>,
    @InjectRepository(InstalledApp) private readonly installed: Repository<InstalledApp>,
    @InjectRepository(Menu) private readonly menus: Repository<Menu>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => AuditLogService)) private readonly auditLog: AuditLogService,
  ) {}

  /** 首次启动写入一个可安装的设备管理示例，便于验证应用商店闭环。 */
  async onModuleInit(): Promise<void> {
    if (await this.apps.count() > 0) return;
    await this.apps.save(this.apps.create({ name: '设备管理', code: 'device-manager', version: '1.0.0', description: '提供设备CRUD及状态监控功能', status: 'published', isSystem: false, manifest: { permissions: ['device:read', 'device:write'], menus: [{ name: '设备管理', path: '/devices', component: 'DeviceList', icon: 'Monitor', sort: 10 }] } }));
  }

  /** 商店只返回尚未安装的已发布应用，避免前端继续展示必然失败的重复安装按钮。 */
  async listStore() {
    return this.apps
      .createQueryBuilder('app')
      .leftJoin('installed_apps', 'installed', 'installed.app_id = app.id')
      .where('app.status = :status', { status: 'published' })
      .andWhere('installed.id IS NULL')
      .orderBy('app.name', 'ASC')
      .getMany();
  }
  async listInstalled() { return this.installed.find({ relations: ['app'], order: { installedAt: 'DESC' } }); }

  async install(appId: number, userId?: number) {
    const app = await this.apps.findOne({ where: { id: appId, status: 'published' } });
    if (!app) throw new NotFoundException('应用不存在或未发布');
    const current = await this.installed.findOne({ where: { appId } });
    if (current) throw new BadRequestException('应用已经安装');
    await this.checkDependencies(app);
    const result = await this.dataSource.transaction(async (manager) => {
      const result = await manager.save(InstalledApp, manager.create(InstalledApp, { appId: app.id, version: app.version, status: 'enabled', config: {} }));
      const declaredMenus = Array.isArray(app.manifest?.menus) ? app.manifest.menus as Array<Record<string, unknown>> : [];
      await this.saveMenus(manager, app.id, declaredMenus);
      return result;
    });
    await this.auditLog.log({
      userId: userId ?? null,
      action: 'install_app',
      module: 'app-manager',
      resource: 'app',
      resourceId: appId.toString(),
      result: 'success',
    });
    return result;
  }

  async setStatus(appId: number, status: 'enabled' | 'disabled', userId?: number) {
    if (status !== 'enabled' && status !== 'disabled') throw new BadRequestException('应用状态只能是 enabled 或 disabled');
    const item = await this.installed.findOne({ where: { appId } });
    if (!item) throw new NotFoundException('应用尚未安装');
    item.status = status;
    const result = await this.installed.save(item);
    await this.auditLog.log({
      userId: userId ?? null,
      action: status === 'enabled' ? 'enable_app' : 'disable_app',
      module: 'app-manager',
      resource: 'app',
      resourceId: appId.toString(),
      result: 'success',
    });
    return result;
  }

  /** 应用只能依赖已安装且启用的应用，安装过程不会留下半成品记录。 */
  private async checkDependencies(app: App): Promise<void> {
    const dependencies = Array.isArray(app.manifest?.dependencies) ? app.manifest.dependencies as Array<{ code?: string }> : [];
    for (const dependency of dependencies) {
      if (!dependency.code) throw new BadRequestException(`应用 ${app.code} 的依赖声明缺少 code`);
      const dependencyApp = await this.apps.findOne({ where: { code: dependency.code } });
      if (!dependencyApp) throw new BadRequestException(`依赖应用 ${dependency.code} 不存在`);
      const installed = await this.installed.findOne({ where: { appId: dependencyApp.id, status: 'enabled' } });
      if (!installed) throw new BadRequestException(`请先安装并启用依赖应用 ${dependency.code}`);
    }
  }

  /** 递归保存清单菜单，并把父菜单数据库 id 传给子菜单。 */
  private async saveMenus(manager: EntityManager, appId: number, menus: Array<Record<string, unknown>>, parentId: number | null = null): Promise<void> {
    for (const menu of menus) {
      const saved = await manager.save(Menu, manager.create(Menu, { appId, name: String(menu.name || ''), path: String(menu.path || ''), component: menu.component ? String(menu.component) : null, icon: menu.icon ? String(menu.icon) : null, sort: Number(menu.sort || 0), parentId }));
      const children = Array.isArray(menu.children) ? menu.children as Array<Record<string, unknown>> : [];
      await this.saveMenus(manager, appId, children, saved.id);
    }
  }

  /** 卸载只移除安装记录和动态菜单，应用商店清单及业务数据由应用自己的卸载钩子管理。 */
  async uninstall(appId: number, userId?: number): Promise<{ success: boolean }> {
    const item = await this.installed.findOne({ where: { appId } });
    if (!item) throw new NotFoundException('应用尚未安装');
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Menu, { appId });
      await manager.delete(InstalledApp, { appId });
    });
    await this.auditLog.log({
      userId: userId ?? null,
      action: 'uninstall_app',
      module: 'app-manager',
      resource: 'app',
      resourceId: appId.toString(),
      result: 'success',
    });
    return { success: true };
  }

  /** 应用配置与安装记录同表持久化，停用或重启后仍然保留。 */
  async updateConfig(appId: number, config: Record<string, unknown>, userId?: number) {
    const item = await this.installed.findOne({ where: { appId } });
    if (!item) throw new NotFoundException('应用尚未安装');
    item.config = config;
    const result = await this.installed.save(item);
    await this.auditLog.log({
      userId: userId ?? null,
      action: 'update_app_config',
      module: 'app-manager',
      resource: 'app',
      resourceId: appId.toString(),
      result: 'success',
    });
    return result;
  }
}
