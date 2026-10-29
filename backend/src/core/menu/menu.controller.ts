import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { MenuService } from './menu.service';

/** 前端登录后调用此接口构建动态侧边栏和路由。 */
@UseGuards(JwtGuard)
@Controller('menus')
export class MenuController {
  constructor(private readonly service: MenuService) {}
  @Get() getMenus() { return this.service.getMenus(); }
}
