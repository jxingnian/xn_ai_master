import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfig } from '../../../entities/ai-config.entity';
import { AiCallLog } from '../../../entities/ai-call-log.entity';
import * as crypto from 'crypto';

@Injectable()
export class AiConfigService {
  constructor(
    @InjectRepository(AiConfig)
    private readonly aiConfigRepo: Repository<AiConfig>,
    @InjectRepository(AiCallLog)
    private readonly aiCallLogRepo: Repository<AiCallLog>,
  ) {}

  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-encryption-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-encryption-key', 'salt', 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length <= 8) return '***';
    return apiKey.substring(0, 4) + '***' + apiKey.substring(apiKey.length - 4);
  }

  async getConfig() {
    const config = await this.aiConfigRepo.findOne({ where: {} });
    if (!config) {
      throw new NotFoundException('AI配置不存在');
    }

    return {
      id: config.id,
      provider: config.provider,
      base_url: config.base_url,
      api_key: this.maskApiKey(this.decrypt(config.api_key)),
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      enabled: config.enabled,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }

  async saveConfig(data: {
    provider: string;
    base_url?: string;
    api_key: string;
    model: string;
    temperature: number;
    max_tokens: number;
    enabled: boolean;
  }) {
    let config = await this.aiConfigRepo.findOne({ where: {} });

    const encryptedKey = this.encrypt(data.api_key);

    if (config) {
      config.provider = data.provider;
      config.base_url = data.base_url || null;
      config.api_key = encryptedKey;
      config.model = data.model;
      config.temperature = data.temperature;
      config.max_tokens = data.max_tokens;
      config.enabled = data.enabled;
    } else {
      config = this.aiConfigRepo.create({
        provider: data.provider,
        base_url: data.base_url || null,
        api_key: encryptedKey,
        model: data.model,
        temperature: data.temperature,
        max_tokens: data.max_tokens,
        enabled: data.enabled,
      });
    }

    await this.aiConfigRepo.save(config);
    return { success: true };
  }

  async testConnection(userId: number | null) {
    const config = await this.aiConfigRepo.findOne({ where: {} });
    if (!config) {
      throw new NotFoundException('AI配置不存在，请先配置');
    }

    const startTime = Date.now();
    let status = 'success';
    let errorMessage: string | null = null;

    try {
      // 这里模拟测试连接，实际项目需要调用AI服务API
      await new Promise(resolve => setTimeout(resolve, 100));

      // 如果需要实际测试，可以使用 fetch 或 axios 调用 AI API
      // const response = await fetch(`${config.base_url}/v1/models`, {
      //   headers: { 'Authorization': `Bearer ${this.decrypt(config.api_key)}` }
      // });
      // if (!response.ok) throw new Error('连接失败');

    } catch (error) {
      status = 'failure';
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const responseTime = Date.now() - startTime;

    // 记录调用日志
    const log = this.aiCallLogRepo.create({
      user_id: userId,
      provider: config.provider,
      model: config.model,
      prompt: '连接测试',
      response: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      response_time_ms: responseTime,
      status,
      error_message: errorMessage,
    });
    await this.aiCallLogRepo.save(log);

    return {
      success: status === 'success',
      responseTime,
      error: errorMessage,
    };
  }

  async getLogs(params: { page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.aiCallLogRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUsage() {
    const totalCalls = await this.aiCallLogRepo.count();
    const successCalls = await this.aiCallLogRepo.count({ where: { status: 'success' } });
    const failureCalls = await this.aiCallLogRepo.count({ where: { status: 'failure' } });

    const result = await this.aiCallLogRepo
      .createQueryBuilder('log')
      .select('SUM(log.total_tokens)', 'totalTokens')
      .getRawOne();

    return {
      totalCalls,
      successCalls,
      failureCalls,
      totalTokens: result?.totalTokens || 0,
    };
  }
}
