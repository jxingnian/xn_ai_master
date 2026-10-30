import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { DataSource, Repository } from 'typeorm';
import { MqttConnection } from './entities/mqtt-connection.entity';
import { MqttMessage } from './entities/mqtt-message.entity';
import { MqttSubscription } from './entities/mqtt-subscription.entity';

export interface MqttInboundMessage {
  connectionCode: string;
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
  receivedAt: Date;
}

type Consumer = (message: MqttInboundMessage) => Promise<void>;

/**
 * MQTT 应用核心服务。
 *
 * 连接实例存放在进程内 Map 中，配置和订阅规则存放在 PostgreSQL 中；
 * 因此服务重启后会从数据库恢复全部启用连接，不依赖某一次 HTTP 请求的生命周期。
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private readonly clients = new Map<string, MqttClient>();
  private readonly consumers = new Map<string, Consumer>();

  constructor(
    @InjectRepository(MqttConnection) private readonly connections: Repository<MqttConnection>,
    @InjectRepository(MqttSubscription) private readonly subscriptions: Repository<MqttSubscription>,
    @InjectRepository(MqttMessage) private readonly messages: Repository<MqttMessage>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = await this.connections.find({ where: { status: 'enabled' } });
    for (const connection of enabled) await this.connect(connection);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => new Promise<void>((resolve) => client.end(true, {}, () => resolve()))));
    this.clients.clear();
  }

  /** 注册业务消费者；设备管理、告警和 OTA 应用通过这个入口接收 MQTT 消息。 */
  registerConsumer(consumerCode: string, handler: Consumer): void {
    if (!consumerCode.trim()) throw new BadRequestException('consumerCode 不能为空');
    this.consumers.set(consumerCode, handler);
  }

  unregisterConsumer(consumerCode: string): void { this.consumers.delete(consumerCode); }

  async listConnections(): Promise<Array<Record<string, unknown>>> {
    const rows = await this.connections.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.safeConnection(row));
  }

  async createConnection(input: Partial<MqttConnection> & { password?: string }): Promise<Record<string, unknown>> {
    const existing = await this.connections.findOne({ where: { connectionCode: input.connectionCode } });
    if (existing) throw new BadRequestException('连接编码已经存在');
    const entity = this.connections.create({
      connectionCode: input.connectionCode,
      name: input.name,
      description: input.description || null,
      protocol: input.protocol || 'mqtt',
      host: input.host,
      port: input.port || (input.protocol === 'mqtts' ? 8883 : 1883),
      path: input.path || null,
      username: input.username || null,
      passwordCiphertext: input.password ? this.encrypt(input.password) : null,
      clientId: input.clientId || `xn-platform-${input.connectionCode}`,
      cleanSession: input.cleanSession ?? true,
      keepAlive: input.keepAlive || 60,
      connectTimeout: input.connectTimeout || 10000,
      tlsEnabled: input.tlsEnabled ?? (input.protocol === 'mqtts' || input.protocol === 'wss'),
      caCertificateCiphertext: input.caCertificateCiphertext || null,
      status: input.status || 'disabled',
    });
    const saved = await this.connections.save(entity);
    if (saved.status === 'enabled') await this.connect(saved);
    return this.safeConnection(saved);
  }

  async updateConnection(id: number, input: Partial<MqttConnection> & { password?: string }): Promise<Record<string, unknown>> {
    const entity = await this.connections.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('MQTT 连接不存在');
    const wasEnabled = entity.status === 'enabled';
    Object.assign(entity, {
      name: input.name ?? entity.name,
      description: input.description ?? entity.description,
      protocol: input.protocol ?? entity.protocol,
      host: input.host ?? entity.host,
      port: input.port ?? entity.port,
      path: input.path ?? entity.path,
      username: input.username ?? entity.username,
      clientId: input.clientId ?? entity.clientId,
      keepAlive: input.keepAlive ?? entity.keepAlive,
      connectTimeout: input.connectTimeout ?? entity.connectTimeout,
      tlsEnabled: input.tlsEnabled ?? entity.tlsEnabled,
      status: input.status ?? entity.status,
    });
    if (input.password !== undefined) entity.passwordCiphertext = input.password ? this.encrypt(input.password) : null;
    const saved = await this.connections.save(entity);
    if (wasEnabled || saved.status === 'enabled') await this.disconnect(saved.connectionCode);
    if (saved.status === 'enabled') await this.connect(saved);
    return this.safeConnection(saved);
  }

  async removeConnection(id: number): Promise<{ success: boolean }> {
    const entity = await this.connections.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('MQTT 连接不存在');
    await this.disconnect(entity.connectionCode);
    await this.connections.remove(entity);
    return { success: true };
  }

  async testConnection(id: number): Promise<{ success: boolean; message: string }> {
    const entity = await this.connections.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('MQTT 连接不存在');
    await this.disconnect(entity.connectionCode);
    try {
      await this.connect(entity, true);
      return { success: true, message: 'MQTT 连接成功' };
    } catch (error) {
      return { success: false, message: this.errorMessage(error) };
    }
  }

  async reconnect(connectionCode: string): Promise<{ success: boolean }> {
    const entity = await this.connections.findOne({ where: { connectionCode } });
    if (!entity) throw new NotFoundException('MQTT 连接不存在');
    await this.disconnect(connectionCode);
    await this.connect(entity);
    return { success: true };
  }

  async listSubscriptions(): Promise<MqttSubscription[]> {
    return this.subscriptions.find({ relations: ['connection'], order: { createdAt: 'DESC' } });
  }

  async createSubscription(input: Partial<MqttSubscription>): Promise<MqttSubscription> {
    const connection = await this.connections.findOne({ where: { id: input.connectionId } });
    if (!connection) throw new NotFoundException('MQTT 连接不存在');
    const entity = this.subscriptions.create({
      connectionId: connection.id,
      subscriptionCode: input.subscriptionCode,
      name: input.name,
      topicFilter: input.topicFilter,
      qos: input.qos ?? 1,
      consumerCode: input.consumerCode || null,
      status: input.status || 'disabled',
    });
    const saved = await this.subscriptions.save(entity);
    if (saved.status === 'enabled' && this.clients.has(connection.connectionCode)) await this.subscribeOne(saved, connection.connectionCode);
    return saved;
  }

  async updateSubscription(id: number, input: Partial<MqttSubscription>): Promise<MqttSubscription> {
    const entity = await this.subscriptions.findOne({ where: { id }, relations: ['connection'] });
    if (!entity) throw new NotFoundException('订阅不存在');
    const connectionCode = entity.connection.connectionCode;
    Object.assign(entity, {
      name: input.name ?? entity.name,
      topicFilter: input.topicFilter ?? entity.topicFilter,
      qos: input.qos ?? entity.qos,
      consumerCode: input.consumerCode ?? entity.consumerCode,
      status: input.status ?? entity.status,
    });
    const saved = await this.subscriptions.save(entity);
    const client = this.clients.get(connectionCode);
    if (client) {
      await new Promise<void>((resolve) => client.unsubscribe(entity.topicFilter, () => resolve()));
      if (saved.status === 'enabled') await this.subscribeOne(saved, connectionCode);
    }
    return saved;
  }

  async removeSubscription(id: number): Promise<{ success: boolean }> {
    const entity = await this.subscriptions.findOne({ where: { id }, relations: ['connection'] });
    if (!entity) throw new NotFoundException('订阅不存在');
    const client = this.clients.get(entity.connection.connectionCode);
    if (client) await new Promise<void>((resolve) => client.unsubscribe(entity.topicFilter, () => resolve()));
    await this.subscriptions.remove(entity);
    return { success: true };
  }

  async publish(input: { connectionCode: string; topic: string; payload: unknown; qos?: 0 | 1 | 2; retain?: boolean }): Promise<Record<string, unknown>> {
    const client = this.clients.get(input.connectionCode);
    if (!client || !client.connected) throw new BadRequestException('MQTT 连接当前未连接');
    const payload = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload);
    await new Promise<void>((resolve, reject) => client.publish(input.topic, payload, { qos: input.qos ?? 0, retain: input.retain ?? false }, (error) => error ? reject(error) : resolve()));
    await this.recordMessage('outbound', input.connectionCode, input.topic, payload, input.qos ?? 0, input.retain ?? false, null, null, 'success');
    return { success: true, connectionCode: input.connectionCode, topic: input.topic };
  }

  async status(): Promise<Array<Record<string, unknown>>> {
    const rows = await this.connections.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => ({ ...this.safeConnection(row), connected: this.clients.get(row.connectionCode)?.connected === true }));
  }

  private async connect(connection: MqttConnection, throwOnError = false): Promise<void> {
    if (this.clients.has(connection.connectionCode)) await this.disconnect(connection.connectionCode);
    const url = this.buildUrl(connection);
    const options: IClientOptions = {
      clientId: connection.clientId,
      username: connection.username || undefined,
      password: connection.passwordCiphertext ? this.decrypt(connection.passwordCiphertext) : undefined,
      clean: connection.cleanSession,
      keepalive: connection.keepAlive,
      connectTimeout: connection.connectTimeout,
      reconnectPeriod: 5000,
      ca: connection.caCertificateCiphertext ? this.decrypt(connection.caCertificateCiphertext) : undefined,
    };
    const client = mqtt.connect(url, options);
    this.clients.set(connection.connectionCode, client);
    client.on('connect', async () => {
      connection.lastConnectedAt = new Date();
      connection.lastError = null;
      await this.connections.save(connection);
      const rules = await this.subscriptions.find({ where: { connectionId: connection.id, status: 'enabled' } });
      for (const rule of rules) await this.subscribeOne(rule, connection.connectionCode);
    });
    client.on('message', (topic, buffer, packet) => void this.handleMessage(connection, topic, buffer.toString(), packet.qos, packet.retain));
    client.on('reconnect', () => { connection.reconnectCount += 1; void this.connections.save(connection); });
    client.on('error', (error) => { connection.lastError = this.errorMessage(error); void this.connections.save(connection); this.logger.error(`${connection.connectionCode}: ${connection.lastError}`); });
    client.on('close', () => { connection.lastDisconnectedAt = new Date(); void this.connections.save(connection); });
    if (throwOnError) await this.waitForConnect(client, connection.connectTimeout);
  }

  private async waitForConnect(client: MqttClient, timeout: number): Promise<void> {
    if (client.connected) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('MQTT 连接超时')); }, timeout);
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => { clearTimeout(timer); client.off('connect', onConnect); client.off('error', onError); };
      client.once('connect', onConnect); client.once('error', onError);
    });
  }

  private async disconnect(connectionCode: string): Promise<void> {
    const client = this.clients.get(connectionCode);
    if (!client) return;
    await new Promise<void>((resolve) => client.end(true, {}, () => resolve()));
    this.clients.delete(connectionCode);
  }

  private async subscribeOne(rule: MqttSubscription, connectionCode: string): Promise<void> {
    const client = this.clients.get(connectionCode);
    if (!client) return;
    await new Promise<void>((resolve, reject) => client.subscribe(rule.topicFilter, { qos: rule.qos }, (error) => error ? reject(error) : resolve()));
  }

  private async handleMessage(connection: MqttConnection, topic: string, payload: string, qos: number, retain: boolean): Promise<void> {
    // 根据 MQTT 主题匹配规则，而不是只取该连接的第一条订阅，保证多个节点可以分别路由给不同应用。
    const rules = await this.subscriptions.find({ where: { connectionId: connection.id, status: 'enabled' } });
    const matchedRules = rules.filter((rule) => this.topicMatches(rule.topicFilter, topic));
    for (const rule of matchedRules) {
      await this.subscriptions.increment({ id: rule.id }, 'messageCount', 1);
      await this.subscriptions.update(rule.id, { lastMessageAt: new Date() });
      await this.recordMessage('inbound', connection.connectionCode, topic, payload, qos, retain, null, rule.consumerCode || null, 'success');
      if (!rule.consumerCode) continue;
      const consumer = this.consumers.get(rule.consumerCode);
      if (consumer) await consumer({ connectionCode: connection.connectionCode, topic, payload, qos, retain, receivedAt: new Date() });
    }
  }

  /** MQTT 主题只支持单层 + 和多层 # 通配符，按段匹配可避免普通字符串匹配误路由。 */
  private topicMatches(filter: string, topic: string): boolean {
    const filters = filter.split('/'); const topics = topic.split('/');
    for (let index = 0; index < filters.length; index += 1) {
      if (filters[index] === '#') return true;
      if (filters[index] !== '+' && filters[index] !== topics[index]) return false;
    }
    return filters.length === topics.length;
  }

  private async recordMessage(direction: 'inbound' | 'outbound', connectionCode: string, topic: string, payload: string, qos: number, retain: boolean, messageId: string | null, consumerCode: string | null, status: string): Promise<void> {
    const preview = payload.length > 2000 ? `${payload.slice(0, 2000)}...` : payload;
    await this.messages.save(this.messages.create({ direction, connectionCode, topic, qos, retain, messageId, consumerCode, status, payloadHash: createHash('sha256').update(payload).digest('hex'), payloadPreview: preview, errorMessage: null }));
  }

  private buildUrl(connection: MqttConnection): string {
    const scheme = connection.protocol || (connection.tlsEnabled ? 'mqtts' : 'mqtt');
    return `${scheme}://${connection.host}:${connection.port}${connection.path || ''}`;
  }

  private safeConnection(row: MqttConnection): Record<string, unknown> {
    const { passwordCiphertext, caCertificateCiphertext, ...safe } = row;
    return { ...safe, passwordConfigured: Boolean(passwordCiphertext), caConfigured: Boolean(caCertificateCiphertext) };
  }

  private encrypt(value: string): string {
    const key = createHash('sha256').update(process.env.MQTT_SECRET_KEY || process.env.JWT_SECRET || 'change-this-secret-in-production').digest();
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decrypt(value: string): string {
    const [ivText, tagText, dataText] = value.split('.');
    const key = createHash('sha256').update(process.env.MQTT_SECRET_KEY || process.env.JWT_SECRET || 'change-this-secret-in-production').digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
  }

  private errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}
