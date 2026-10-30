import { Injectable, NotFoundException, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { AuditLogService } from '../../platform/settings/audit/audit-log.service';

/** 认证服务负责管理员初始化、密码校验和 JWT 签发。 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    @Inject(forwardRef(() => AuditLogService)) private readonly auditLog: AuditLogService,
  ) {}

  /** 首次启动自动创建管理员，账号密码由环境变量提供，避免把密钥写入代码。 */
  async ensureAdmin(): Promise<void> {
    const count = await this.users.count();
    if (count > 0) return;
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const user = this.users.create({ username, password: await bcrypt.hash(password, 12), status: 'active' });
    await this.users.save(user);
  }

  async login(username: string, password: string, ip?: string): Promise<{ accessToken: string; user: { id: number; username: string } }> {
    const user = await this.users.findOne({ where: { username, status: 'active' } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      await this.auditLog.log({
        userId: null,
        action: 'login',
        module: 'auth',
        resource: 'user',
        requestIp: ip,
        requestMethod: 'POST',
        requestPath: '/api/auth/login',
        result: 'failure',
        errorMessage: '用户名或密码错误',
      });
      throw new UnauthorizedException('用户名或密码错误');
    }
    user.lastLoginAt = new Date();
    await this.users.save(user);
    await this.auditLog.log({
      userId: user.id,
      action: 'login',
      module: 'auth',
      resource: 'user',
      resourceId: user.id.toString(),
      requestIp: ip,
      requestMethod: 'POST',
      requestPath: '/api/auth/login',
      result: 'success',
    });
    return { accessToken: this.jwt.sign({ sub: user.id, username: user.username, role: 'admin' }), user: { id: user.id, username: user.username } };
  }

  /** 只返回账号展示字段，明确排除数据库中的 bcrypt 密码哈希。 */
  async getProfile(userId: number): Promise<{ id: number; username: string; email: string | null; status: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('管理员账号不存在');
    return { id: user.id, username: user.username, email: user.email, status: user.status };
  }

  /** 保存管理员资料，并返回同样的脱敏结构，避免接口意外暴露密码字段。 */
  async updateProfile(userId: number, email?: string): Promise<{ id: number; username: string; email: string | null; status: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('管理员账号不存在');
    if (email !== undefined) user.email = email;
    await this.users.save(user);
    await this.auditLog.log({
      userId,
      action: 'update_profile',
      module: 'auth',
      resource: 'user',
      resourceId: userId.toString(),
      result: 'success',
    });
    return this.getProfile(userId);
  }

  /** 校验旧密码后再写入新哈希，旧密码不正确时数据库不会发生任何修改。 */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    const user = await this.users.findOne({ where: { id: userId, status: 'active' } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      await this.auditLog.log({
        userId,
        action: 'change_password',
        module: 'auth',
        resource: 'user',
        resourceId: userId.toString(),
        result: 'failure',
        errorMessage: '当前密码错误',
      });
      throw new UnauthorizedException('当前密码错误');
    }
    user.password = await bcrypt.hash(newPassword, 12);
    await this.users.save(user);
    await this.auditLog.log({
      userId,
      action: 'change_password',
      module: 'auth',
      resource: 'user',
      resourceId: userId.toString(),
      result: 'success',
    });
    return { success: true };
  }
}
