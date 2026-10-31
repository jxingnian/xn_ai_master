import { DataSource } from 'typeorm';
import { App } from '../../entities/app.entity';
import { Menu } from '../../entities/menu.entity';

/**
 * 凤飞飞设备应用初始化脚本。
 *
 * 在应用商店注册凤飞飞设备应用，并创建菜单结构。
 */
export async function initFeifeiDeviceApp(dataSource: DataSource): Promise<void> {
  const appRepo = dataSource.getRepository(App);
  const menuRepo = dataSource.getRepository(Menu);

  // 检查应用是否已存在
  let app = await appRepo.findOne({ where: { code: 'feifei-device' } });

  if (!app) {
    // 创建应用
    app = appRepo.create({
      name: '凤飞飞设备',
      code: 'feifei-device',
      version: '1.0.0',
      description: '凤飞飞设备管理应用，提供设备接入、配对绑定、在线状态监控和设备管理功能',
      icon: 'device',
      status: 'published',
      isSystem: false,
      manifest: {
        permissions: [
          'feifei-device:read',
          'feifei-device:write',
          'feifei-device:delete',
          'feifei-device:pair',
          'feifei-device:unbind',
          'feifei-device:command',
          'feifei-device:docs:read',
        ],
        dependencies: ['mqtt'],
      },
    });

    app = await appRepo.save(app);
    console.log('凤飞飞设备应用已创建');
  }

  // 创建菜单
  const existingMenus = await menuRepo.find({ where: { appId: app.id } });
  if (existingMenus.length === 0) {
    const menus = [
      {
        appId: app.id,
        name: '凤飞飞设备',
        path: '/feifei-device',
        component: null,
        icon: 'device',
        sort: 40,
        parentId: null,
      },
    ];

    for (const menuData of menus) {
      const menu = menuRepo.create(menuData);
      await menuRepo.save(menu);
    }

    console.log('凤飞飞设备应用菜单已创建');
  }
}
