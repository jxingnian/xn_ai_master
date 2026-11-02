import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { WebrtcSignalingService } from './webrtc-signaling.service';

/** 原生 WebSocket 信令网关。通过 HTTP Server 的 upgrade 事件挂载，路径固定为 /api/webrtc-signaling/ws。 */
@Injectable()
export class WebrtcSignalingGateway implements OnModuleInit {
  private readonly logger = new Logger(WebrtcSignalingGateway.name);
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly clients = new Map<WebSocket, { userId: number; sessionId?: string }>();

  constructor(private readonly jwt: JwtService, private readonly service: WebrtcSignalingService) {}

  onModuleInit(): void {
    this.service.setBroadcaster((sessionId, message) => this.broadcast(sessionId, message));
    this.server.on('connection', (socket, request) => this.onConnection(socket, request));
  }

  handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
    if (request.url?.split('?')[0] !== '/api/webrtc-signaling/ws') { socket.destroy(); return; }
    this.server.handleUpgrade(request, socket, head, (client) => this.server.emit('connection', client, request));
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '') || new URL(request.url || '/', 'http://localhost').searchParams.get('wsToken') || '';
    let payload: any;
    try { payload = this.jwt.verify(token); if (payload.purpose !== 'webrtc-ws' && !request.headers.authorization) throw new Error('无效令牌用途'); } catch { socket.close(1008, '登录状态已失效'); return; }
    const userId = Number(payload.sub);
    if (!userId) { socket.close(1008, '用户身份无效'); return; }
    this.clients.set(socket, { userId });
    socket.send(JSON.stringify({ type: 'connected', connectionId: `ws-${Date.now()}`, serverTime: new Date().toISOString(), heartbeatIntervalMs: 15000 }));
    socket.on('message', (raw) => void this.onMessage(socket, raw.toString()));
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', (error) => this.logger.warn(`WebSocket 错误：${error.message}`));
  }

  private async onMessage(socket: WebSocket, raw: string): Promise<void> {
    const client = this.clients.get(socket); if (!client) return;
    try { const message = JSON.parse(raw); if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; } client.sessionId = String(message.sessionId || ''); await this.service.handleFrontendSignal(client.userId, message); } catch (error) { socket.send(JSON.stringify({ type: 'error', code: 'SIGNAL_REJECTED', message: error instanceof Error ? error.message : String(error) })); }
  }

  private broadcast(sessionId: string, message: Record<string, unknown>): void { for (const [socket, client] of this.clients) if (client.sessionId === sessionId || (message.sessionId === sessionId && client.sessionId === undefined)) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); } }
}
