import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { MqttConnection } from './mqtt-connection.entity';

/**
 * MQTT 订阅规则。
 * consumerCode 用于把消息路由给后台具体业务应用，MQTT 应用不耦合设备业务代码。
 */
@Entity('mqtt_subscriptions')
@Unique(['connectionId', 'topicFilter'])
export class MqttSubscription {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'connection_id' }) connectionId!: number;
  @ManyToOne(() => MqttConnection, (connection) => connection.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' }) connection!: MqttConnection;
  @Column({ name: 'subscription_code', length: 80 }) subscriptionCode!: string;
  @Column({ length: 120 }) name!: string;
  @Column({ name: 'topic_filter', length: 500 }) topicFilter!: string;
  @Column({ type: 'int', default: 1 }) qos!: 0 | 1 | 2;
  @Column({ default: 'enabled', length: 20 }) status!: 'enabled' | 'disabled';
  @Column({ name: 'consumer_code', type: 'varchar', length: 100, nullable: true }) consumerCode!: string | null;
  @Column({ name: 'message_count', type: 'bigint', default: 0 }) messageCount!: number;
  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true }) lastMessageAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
