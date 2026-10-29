import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

/** 认证服务负责管理员初始化、密码校验和 JWT 签发。 */
@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>, private readonly jwt: JwtService) {}

  /** 首次启动自动创建管理员，账号密码由环境变量提供，避免把密钥写入代码。 */
  async ensureAdmin(): Promise<void> {
    const count = await this.users.count();
    if (count > 0) return;
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const user = this.users.create({ username, password: await bcrypt.hash(password, 12), status: 'active' });
    await this.users.save(user);
  }

  async login(username: string, password: string): Promise<{ accessToken: string; user: { id: number; username: string } }> {
    const user = await this.users.findOne({ where: { username, status: 'active' } });
    if (!user || !(await bcrypt.compare(password, user.password))) throw new UnauthorizedException('用户名或密码错误');
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return { accessToken: this.jwt.sign({ sub: user.id, username: user.username, role: 'admin' }), user: { id: user.id, username: user.username } };
  }
}
