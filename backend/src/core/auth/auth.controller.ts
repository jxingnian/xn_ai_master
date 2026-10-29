import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
}

/** 登录接口是平台的统一入口，成功后前端使用 Bearer Token 访问受保护 API。 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto.username, dto.password); }
}
