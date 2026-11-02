import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** 菜单只返回系统默认菜单和已启用应用菜单，保证停用/卸载后自动隐藏。 */
@Injectable()
export class MenuService {
  constructor(private readonly dataSource: DataSource) {}
  async getMenus() {
    // 查询父菜单 ID，前端才能将应用的子菜单还原为二级菜单树。
    const rows = await this.dataSource.query(`SELECT m.id, m.parent_id, m.name, m.path, m.component, m.icon, m.sort, a.code AS app_code
      FROM menus m INNER JOIN installed_apps i ON i.app_id = m.app_id AND i.status = 'enabled'
      INNER JOIN apps a ON a.id = m.app_id ORDER BY m.sort ASC, m.id ASC`);
    const dynamicMenus = this.buildTree(rows);
    return [
      { name: '设置', path: '/settings', component: 'Settings', icon: 'Setting', sort: 1 },
      { name: '应用商店', path: '/store', component: 'Store', icon: 'Shop', sort: 2 },
      { name: 'AI', path: '/ai', component: 'Ai', icon: 'MagicStick', sort: 3 },
      ...dynamicMenus,
    ];
  }

  /** 将数据库的 parent_id 平面记录转换为前端可直接渲染的 children 树。 */
  private buildTree(rows: Array<{ id: number; parent_id: number | null; name: string; path: string; component: string | null; icon: string | null; sort: number; app_code: string }>) {
    const nodes = rows.map((row) => ({ name: row.name, path: row.path, component: row.component, icon: row.icon, sort: row.sort, appCode: row.app_code, children: [] as unknown[] }));
    const byId = new Map(rows.map((row, index) => [row.id, nodes[index]]));
    const roots: typeof nodes = [];
    rows.forEach((row, index) => {
      const parent = row.parent_id === null ? undefined : byId.get(row.parent_id);
      if (parent) parent.children.push(nodes[index]);
      else roots.push(nodes[index]);
    });
    return roots;
  }
}
