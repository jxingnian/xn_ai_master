import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
}

/** 修改管理员资料时允许修改的字段；账号名属于登录标识，不能在这里被静默替换。 */
class UpdateProfileDto {
  @IsOptional() @IsEmail() email?: string;
}

/** 修改密码必须同时提交旧密码，防止已登录会话被他人直接接管。 */
class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

/** 登录接口是平台的统一入口，成功后前端使用 Bearer Token 访问受保护 API。 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') login(@Body() dto: LoginDto, @Req() request: Request) {
    const ip = request.ip || request.socket.remoteAddress;
    return this.auth.login(dto.username, dto.password, ip);
  }

  @UseGuards(JwtGuard)
  @Get('profile') profile(@Req() request: Request) { return this.auth.getProfile(this.userId(request)); }

  @UseGuards(JwtGuard)
  @Patch('profile') updateProfile(@Req() request: Request, @Body() dto: UpdateProfileDto) { return this.auth.updateProfile(this.userId(request), dto.email); }

  @UseGuards(JwtGuard)
  @Post('password') changePassword(@Req() request: Request, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(this.userId(request), dto.currentPassword, dto.newPassword); }

  /** JWT 的登出由客户端删除令牌完成；该接口返回统一结果，便于前端和审计调用方保持一致。 */
  @UseGuards(JwtGuard)
  @Post('logout') logout() { return { success: true }; }

  private userId(request: Request): number {
    return Number((request as Request & { user?: { sub?: number } }).user?.sub);
  }
}
