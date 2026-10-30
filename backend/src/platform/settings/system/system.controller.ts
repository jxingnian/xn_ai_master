import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../../core/auth/jwt.guard';
import { SystemService } from './system.service';

@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health')
  health() {
    return this.systemService.getHealth();
  }

  @UseGuards(JwtGuard)
  @Get('settings/system/status')
  status() {
    return this.systemService.getSystemStatus();
  }
}
