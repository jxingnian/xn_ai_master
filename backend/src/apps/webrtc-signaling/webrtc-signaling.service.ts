import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { MqttInboundMessage, MqttService } from '../mqtt/mqtt.service';
import { DeviceDevice } from '../feifei-device/entities/device-device.entity';
import { WebrtcConfig } from './entities/webrtc-config.entity';
import { WebrtcEventLog } from './entities/webrtc-event-log.entity';
import { WebrtcSession } from './entities/webrtc-session.entity';
import { CreateWebrtcSessionDto } from './dto/create-session.dto';
import { UpdateWebrtcConfigDto } from './dto/update-config.dto';
import { SignalMessageDto } from './dto/signal-message.dto';

const TERMINAL_STATES = new Set(['ended', 'rejected', 'cancelled', 'timeout', 'failed']);
const SIGNAL_TYPES = new Set(['call.accept', 'call.reject', 'call.cancel', 'call.end', 'webrtc.offer', 'webrtc.answer', 'webrtc.ice-candidate', 'webrtc.ice-complete']);

/**
 * WebRTC 信令业务服务。
 *
 * 该服务只传递会话控制消息和 SDP/ICE 信令，不接触音视频媒体流；
 * 设备信令统一通过 MqttService 发布和消费，避免业务应用各自创建 MQTT 客户端。
 */
@Injectable()
export class WebrtcSignalingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebrtcSignalingService.name);
  private timeoutTimer?: NodeJS.Timeout;
  private broadcaster: ((sessionId: string, message: Record<string, unknown>) => void) | null = null;

  constructor(
    @InjectRepository(WebrtcSession) private readonly sessions: Repository<WebrtcSession>,
    @InjectRepository(WebrtcConfig) private readonly configs: Repository<WebrtcConfig>,
    @InjectRepository(WebrtcEventLog) private readonly events: Repository<WebrtcEventLog>,
    @InjectRepository(DeviceDevice) private readonly devices: Repository<DeviceDevice>,
    private readonly mqtt: MqttService,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
  ) {}

  /** 模块启动时注册唯一设备信令消费者，并确保 MQTT 应用存在对应订阅。 */
  async onModuleInit(): Promise<void> {
    this.mqtt.registerConsumer('webrtc-signaling', (message) => this.handleDeviceMessage(message));
    try {
      const connections = await this.mqtt.status();
      const connection = connections.find((item) => item.status === 'enabled');
      if (connection?.id) {
        const subscriptions = await this.mqtt.listSubscriptions();
        const existing = subscriptions.find((item) => item.subscriptionCode === 'webrtc-signaling-subscription');
        if (!existing) await this.mqtt.createSubscription({ connectionId: Number(connection.id), subscriptionCode: 'webrtc-signaling-subscription', name: 'WebRTC 设备信令', topicFilter: 'xn/+/+/webrtc_signal', qos: 1, consumerCode: 'webrtc-signaling', status: 'enabled' });
        else if (existing.topicFilter !== 'xn/+/+/webrtc_signal' || existing.status !== 'enabled') await this.mqtt.updateSubscription(Number(existing.id), { topicFilter: 'xn/+/+/webrtc_signal', status: 'enabled', consumerCode: 'webrtc-signaling' });
      }
    } catch (error) {
      this.logger.warn(`WebRTC MQTT 订阅初始化失败：${this.errorMessage(error)}`);
    }
    await this.ensureDefaultConfig();
    // 定时回收未接听和协商卡住的会话，避免监控长期显示虚假进行中通话。
    this.timeoutTimer = setInterval(() => void this.expireSessions(), 10000);
    this.timeoutTimer.unref?.();
  }

  /** 模块销毁时停止定时器，保证测试和热重载进程可以正常退出。 */
  onModuleDestroy(): void { if (this.timeoutTimer) clearInterval(this.timeoutTimer); }

  setBroadcaster(broadcaster: (sessionId: string, message: Record<string, unknown>) => void): void { this.broadcaster = broadcaster; }

  /** 为浏览器 WebSocket 握手生成 60 秒有效的短期令牌，避免把长期 JWT 放入 URL。 */
  issueWsToken(userId: number, role: string): string { return this.jwt.sign({ sub: userId, role, purpose: 'webrtc-ws' }, { expiresIn: '60s' }); }

  async createSession(dto: CreateWebrtcSessionDto, callerUserId: number): Promise<Record<string, unknown>> {
    const device = await this.devices.findOne({ where: { deviceId: dto.deviceId } });
    if (!device) throw new NotFoundException('设备不存在');
    if (!device.enabled || device.status !== 'online') throw new BadRequestException('设备当前不在线或已停用');
    const running = await this.sessions.findOne({ where: { deviceId: device.deviceId, status: 'ringing' } });
    const connecting = await this.sessions.findOne({ where: { deviceId: device.deviceId, status: 'connecting' } });
    const connected = await this.sessions.findOne({ where: { deviceId: device.deviceId, status: 'connected' } });
    if (running || connecting || connected) throw new BadRequestException('设备已有进行中的通话');
    const session = this.sessions.create({ sessionId: `rtc-${randomUUID()}`, deviceId: device.deviceId, callerUserId, callType: dto.callType, status: 'created', currentSequence: 0, ringingAt: null, connectedAt: null, endedAt: null, endReason: null, lastErrorCode: null });
    await this.sessions.save(session);
    await this.writeEvent(session, 'server', 'call.created', 0, { deviceId: device.deviceId, callType: dto.callType }, null);
    try {
      await this.publishDevice(session, 'call.invite', { callType: dto.callType });
      session.status = 'ringing'; session.ringingAt = new Date();
      await this.sessions.save(session);
      await this.writeEvent(session, 'server', 'call.invite', 0, { deviceId: device.deviceId }, null);
    } catch (error) {
      await this.finishSession(session, 'failed', 'MQTT_PUBLISH_FAILED');
      throw new BadRequestException(`呼叫发送失败：${this.errorMessage(error)}`);
    }
    return this.sessionResponse(session, await this.getIceServers());
  }

  async listSessions(query: { status?: string; deviceId?: string; limit?: number }): Promise<WebrtcSession[]> {
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
    const builder = this.sessions.createQueryBuilder('session').orderBy('session.createdAt', 'DESC').take(limit);
    if (query.status) builder.andWhere('session.status = :status', { status: query.status });
    if (query.deviceId) builder.andWhere('session.device_id = :deviceId', { deviceId: query.deviceId });
    return builder.getMany();
  }

  async getSession(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.sessions.findOne({ where: { sessionId } });
    if (!session) throw new NotFoundException('通话会话不存在');
    return this.sessionResponse(session);
  }

  async getEvents(sessionId: string): Promise<WebrtcEventLog[]> {
    const session = await this.sessions.findOne({ where: { sessionId } });
    if (!session) throw new NotFoundException('通话会话不存在');
    return this.events.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
  }

  async terminate(sessionId: string, reason: string): Promise<Record<string, unknown>> {
    const session = await this.sessions.findOne({ where: { sessionId } });
    if (!session) throw new NotFoundException('通话会话不存在');
    if (!TERMINAL_STATES.has(session.status)) {
      await this.finishSession(session, 'ended', reason || 'user_hangup');
      try { await this.publishDevice(session, 'call.end', { reason: reason || 'user_hangup' }); } catch (error) { this.logger.warn(`结束消息发送失败：${this.errorMessage(error)}`); }
      this.broadcast(session.sessionId, { type: 'call.end', sessionId: session.sessionId, payload: { reason: reason || 'user_hangup' } });
    }
    return this.sessionResponse(session);
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const config = await this.ensureDefaultConfig();
    return { id: config.id, name: config.name, stunUrls: config.stunUrls, turnUrls: config.turnUrls, productCode: config.productCode, commandTopicTemplate: config.commandTopicTemplate, signalTopicTemplate: config.signalTopicTemplate, turnConfigured: Boolean(config.turnUrls.length && config.turnUsernameCiphertext && config.turnSecretCiphertext), turnCredentialMode: config.turnCredentialMode, enabled: config.enabled, isDefault: config.isDefault, updatedAt: config.updatedAt };
  }

  async updateConfig(dto: UpdateWebrtcConfigDto): Promise<Record<string, unknown>> {
    const config = await this.ensureDefaultConfig();
    const validateUrls = (urls: string[]) => urls.every((url) => /^(stun|stuns|turn|turns):[^\s]+$/i.test(url));
    if (!validateUrls(dto.stunUrls || []) || !validateUrls(dto.turnUrls || [])) throw new BadRequestException('STUN/TURN 地址必须使用 stun、stuns、turn 或 turns 协议');
    config.name = dto.name?.trim() || config.name; config.stunUrls = dto.stunUrls || []; config.turnUrls = dto.turnUrls || []; config.enabled = dto.enabled !== false; config.turnCredentialMode = dto.turnCredentialMode || config.turnCredentialMode;
    if (dto.productCode !== undefined) config.productCode = dto.productCode.trim();
    if (dto.commandTopicTemplate !== undefined) config.commandTopicTemplate = this.validateTopicTemplate(dto.commandTopicTemplate, 'commandTopicTemplate');
    if (dto.signalTopicTemplate !== undefined) config.signalTopicTemplate = this.validateTopicTemplate(dto.signalTopicTemplate, 'signalTopicTemplate');
    if (dto.turnUsername !== undefined) config.turnUsernameCiphertext = dto.turnUsername ? this.encrypt(dto.turnUsername) : null;
    if (dto.turnSecret !== undefined) config.turnSecretCiphertext = dto.turnSecret ? this.encrypt(dto.turnSecret) : null;
    await this.configs.save(config);
    return this.getConfig();
  }

  async getMonitor(): Promise<Record<string, unknown>> {
    const active = await this.sessions.count({ where: [{ status: 'created' }, { status: 'ringing' }, { status: 'connecting' }, { status: 'connected' }] });
    const totals = await this.sessions.createQueryBuilder('session').select('session.status', 'status').addSelect('COUNT(*)', 'count').groupBy('session.status').getRawMany();
    return { active, totals };
  }

  /** 返回后台自检结果，设备接入前可先确认 MQTT、主题和 STUN/TURN 配置。 */
  async getHealth(): Promise<Record<string, unknown>> {
    const config = await this.ensureDefaultConfig();
    const connections = await this.mqtt.status();
    return {
      mqttConnected: connections.some((item) => item.status === 'enabled' && item.connected === true),
      productCode: config.productCode,
      commandTopicTemplate: config.commandTopicTemplate,
      signalTopicTemplate: config.signalTopicTemplate,
      stunConfigured: config.enabled && config.stunUrls.length > 0,
      turnConfigured: Boolean(config.turnUrls.length && config.turnUsernameCiphertext && config.turnSecretCiphertext),
      activeSessions: await this.sessions.count({ where: [{ status: 'created' }, { status: 'ringing' }, { status: 'connecting' }, { status: 'connected' }] }),
    };
  }

  /** WebSocket 层将已认证用户的信令交给这里，统一做状态和序列校验。 */
  async handleFrontendSignal(userId: number, message: SignalMessageDto): Promise<void> {
    const session = await this.sessions.findOne({ where: { sessionId: message.sessionId } });
    if (!session) throw new BadRequestException('会话不存在');
    if (session.callerUserId !== userId) throw new BadRequestException('当前用户无权操作此会话');
    await this.processSignal(session, 'frontend', message);
  }

  private async handleDeviceMessage(message: MqttInboundMessage): Promise<void> {
    const parts = message.topic.split('/');
    if (parts.length !== 4 || parts[0] !== 'xn' || parts[3] !== 'webrtc_signal') return;
    let envelope: any;
    try { envelope = JSON.parse(message.payload); } catch { return; }
    if (envelope?.version !== 1 || typeof envelope.deviceId !== 'string' || envelope.deviceId !== parts[2] || typeof envelope.requestId !== 'string' || !envelope.data) return;
    const session = await this.sessions.findOne({ where: { sessionId: envelope.requestId } });
    if (!session || session.deviceId !== parts[2]) return;
    const signal: SignalMessageDto = { messageId: String(envelope.messageId || ''), sessionId: session.sessionId, type: String(envelope.type || ''), sequence: Number(envelope.data.sequence || 0), payload: envelope.data };
    if (!signal.messageId || !signal.sequence) return;
    await this.processSignal(session, 'device', signal);
  }

  private async processSignal(session: WebrtcSession, direction: 'frontend' | 'device', message: SignalMessageDto): Promise<void> {
    if (!SIGNAL_TYPES.has(message.type)) throw new BadRequestException('不支持的 WebRTC 信令类型');
    if (TERMINAL_STATES.has(session.status)) throw new BadRequestException('会话已经结束');
    if (message.sequence < session.currentSequence) return;
    const duplicate = await this.events.findOne({ where: { sessionId: session.sessionId, messageId: message.messageId } });
    if (duplicate) return;
    await this.writeEvent(session, direction, message.type, message.sequence, message.payload || {}, message.messageId);
    session.currentSequence = Math.max(session.currentSequence, message.sequence);
    if (message.type === 'call.accept') session.status = 'connecting';
    if (message.type === 'webrtc.offer' || message.type === 'webrtc.answer' || message.type === 'webrtc.ice-candidate' || message.type === 'webrtc.ice-complete') session.status = session.status === 'ringing' ? 'connecting' : session.status;
    if (message.type === 'call.reject') { session.status = 'rejected'; session.endReason = 'device_reject'; session.endedAt = new Date(); }
    if (message.type === 'call.cancel') { session.status = 'cancelled'; session.endReason = 'cancelled'; session.endedAt = new Date(); }
    if (message.type === 'call.end') { session.status = 'ended'; session.endReason = String(message.payload?.reason || 'remote_hangup'); session.endedAt = new Date(); }
    // SDP Answer 只表示协商继续，双方 ICE 候选交换完成后才确认媒体链路已建立。
    if (message.type === 'webrtc.ice-complete') { session.status = 'connected'; session.connectedAt = session.connectedAt || new Date(); }
    await this.sessions.save(session);
    this.broadcast(session.sessionId, { ...message, direction });
    if (direction === 'frontend') await this.publishDevice(session, message.type, message.payload || {}, message.messageId, message.sequence);
  }

  private async publishDevice(session: WebrtcSession, type: string, data: Record<string, unknown>, messageId: string = randomUUID(), sequence = session.currentSequence + 1): Promise<void> {
    const connections = await this.mqtt.status();
    const connection = connections.find((item) => item.status === 'enabled' && item.connected === true);
    if (!connection?.connectionCode) throw new Error('MQTT 应用没有可用连接');
    const config = await this.ensureDefaultConfig();
    const topic = config.commandTopicTemplate.replace('{productCode}', config.productCode).replace('{deviceId}', session.deviceId);
    await this.mqtt.publish({ connectionCode: String(connection.connectionCode), topic, qos: 1, payload: { version: 1, messageId, type, deviceId: session.deviceId, timestamp: Date.now(), requestId: session.sessionId, data: { ...data, sessionId: session.sessionId, sequence } } });
  }

  private async finishSession(session: WebrtcSession, status: string, reason: string): Promise<void> { session.status = status; session.endReason = reason; session.lastErrorCode = status === 'failed' ? reason : null; session.endedAt = new Date(); await this.sessions.save(session); await this.writeEvent(session, 'server', `call.${status}`, session.currentSequence, { reason }, null); }
  private broadcast(sessionId: string, message: Record<string, unknown>): void { this.broadcaster?.(sessionId, message); }
  private async writeEvent(session: WebrtcSession, direction: 'frontend' | 'device' | 'server', type: string, sequence: number, payload: Record<string, unknown>, messageId: string | null): Promise<void> { const raw = JSON.stringify(payload); await this.events.save(this.events.create({ sessionId: session.sessionId, eventId: `evt-${randomUUID()}`, messageId, direction, eventType: type, sequence, payloadHash: createHash('sha256').update(raw).digest('hex'), payloadPreview: raw.length > 2000 ? `${raw.slice(0, 2000)}...` : raw, errorCode: null })); }
  private sessionResponse(session: WebrtcSession, iceServers?: unknown[]): Record<string, unknown> { return { sessionId: session.sessionId, deviceId: session.deviceId, callerUserId: session.callerUserId, callType: session.callType, status: session.status, currentSequence: session.currentSequence, startedAt: session.startedAt, connectedAt: session.connectedAt, endedAt: session.endedAt, endReason: session.endReason, iceServers: iceServers || undefined }; }
  private async ensureDefaultConfig(): Promise<WebrtcConfig> { let config = await this.configs.findOne({ where: { isDefault: true } }); if (!config) config = await this.configs.save(this.configs.create({ name: '默认 WebRTC 配置', stunUrls: ['stun:stun.l.google.com:19302'], turnUrls: [], turnUsernameCiphertext: null, turnSecretCiphertext: null, turnCredentialMode: 'temporary', productCode: 'xn_device', commandTopicTemplate: 'xn/{productCode}/{deviceId}/webrtc_command', signalTopicTemplate: 'xn/{productCode}/{deviceId}/webrtc_signal', enabled: true, isDefault: true })); return config; }
  private validateTopicTemplate(template: string, field: string): string { const value = template.trim(); if (!value.includes('{deviceId}') || !value.includes('{productCode}') || !/^xn\/[A-Za-z0-9_{}+\-\/]+$/.test(value)) throw new BadRequestException(`${field} 必须包含 {productCode} 和 {deviceId}`); return value; }
  private async expireSessions(): Promise<void> { const now = Date.now(); const sessions = await this.sessions.find({ where: [{ status: 'ringing' }, { status: 'connecting' }] }); for (const session of sessions) { const started = (session.ringingAt || session.startedAt).getTime(); const timeout = session.status === 'ringing' ? 60000 : 120000; if (now - started >= timeout) await this.finishSession(session, 'timeout', session.status === 'ringing' ? 'RING_TIMEOUT' : 'ICE_TIMEOUT'); } }
  /** 按 TURN REST 规范生成短期凭据，浏览器永远拿不到数据库中的长期密钥。 */
  private async getIceServers(): Promise<unknown[]> { const config = await this.ensureDefaultConfig(); if (!config.enabled) return []; const servers: Array<Record<string, unknown>> = []; if (config.stunUrls.length) servers.push({ urls: config.stunUrls }); if (config.turnUrls.length && config.turnSecretCiphertext) { const expiresAt = Math.floor(Date.now() / 1000) + 300; const userPrefix = config.turnUsernameCiphertext ? this.decrypt(config.turnUsernameCiphertext) : 'webrtc'; const username = `${expiresAt}:${userPrefix}`; const credential = createHmac('sha1', this.decrypt(config.turnSecretCiphertext)).update(username).digest('base64'); servers.push({ urls: config.turnUrls, username, credential }); } return servers; }
  private encrypt(value: string): string { const key = createHash('sha256').update(process.env.WEBRTC_SECRET_KEY || process.env.JWT_SECRET || 'change-this-secret-in-production').digest(); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`; }
  private decrypt(value: string): string { const [ivText, tagText, dataText] = value.split('.'); const key = createHash('sha256').update(process.env.WEBRTC_SECRET_KEY || process.env.JWT_SECRET || 'change-this-secret-in-production').digest(); const decipher = require('crypto').createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64')); decipher.setAuthTag(Buffer.from(tagText, 'base64')); return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8'); }
  private errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}
