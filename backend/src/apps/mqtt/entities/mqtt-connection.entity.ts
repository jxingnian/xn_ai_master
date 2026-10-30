import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MqttSubscription } from './mqtt-subscription.entity';

/**
 * MQTT 服务器连接配置。
 *
 * 一个后台实例可以同时连接多个 MQTT Broker，因此连接配置不能放在单例环境变量中。
 * 密码和证书字段保存的是应用层加密后的内容，接口响应时由服务层主动脱敏。
 */
@Entity('mqtt_connections')
export class MqttConnection {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'connection_code', length: 80, unique: true }) connectionCode!: string;
  @Column({ length: 120 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ length: 10, default: 'mqtt' }) protocol!: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  @Column({ length: 255 }) host!: string;
  @Column({ type: 'int', default: 1883 }) port!: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) path!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) username!: string | null;
  @Column({ name: 'password_ciphertext', type: 'text', nullable: true }) passwordCiphertext!: string | null;
  @Column({ name: 'client_id', length: 255 }) clientId!: string;
  @Column({ name: 'clean_session', default: true }) cleanSession!: boolean;
  @Column({ name: 'keep_alive', type: 'int', default: 60 }) keepAlive!: number;
  @Column({ name: 'connect_timeout', type: 'int', default: 10000 }) connectTimeout!: number;
  @Column({ name: 'tls_enabled', default: false }) tlsEnabled!: boolean;
  @Column({ name: 'ca_certificate_ciphertext', type: 'text', nullable: true }) caCertificateCiphertext!: string | null;
  @Column({ default: 'disabled', length: 20 }) status!: 'enabled' | 'disabled';
  @Column({ name: 'last_connected_at', type: 'timestamp', nullable: true }) lastConnectedAt!: Date | null;
  @Column({ name: 'last_disconnected_at', type: 'timestamp', nullable: true }) lastDisconnectedAt!: Date | null;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError!: string | null;
  @Column({ name: 'reconnect_count', type: 'int', default: 0 }) reconnectCount!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
  @OneToMany(() => MqttSubscription, (subscription) => subscription.connection) subscriptions!: MqttSubscription[];
}
