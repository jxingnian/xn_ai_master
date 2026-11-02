import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** STUN/TURN 配置。TURN 用户名和密钥只保存应用层密文，接口永不直接返回密文。 */
@Entity('webrtc_config')
export class WebrtcConfig {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ length: 120 }) name!: string;
  @Column({ name: 'stun_urls_json', type: 'jsonb', default: () => "'[]'" }) stunUrls!: string[];
  @Column({ name: 'turn_urls_json', type: 'jsonb', default: () => "'[]'" }) turnUrls!: string[];
  @Column({ name: 'turn_username_ciphertext', type: 'text', nullable: true }) turnUsernameCiphertext!: string | null;
  @Column({ name: 'turn_secret_ciphertext', type: 'text', nullable: true }) turnSecretCiphertext!: string | null;
  @Column({ name: 'turn_credential_mode', length: 20, default: 'temporary' }) turnCredentialMode!: 'static' | 'temporary';
  // 主题模板配置使同一信令应用可以服务多个设备产品。
  @Column({ name: 'product_code', length: 80, default: 'xn_device' }) productCode!: string;
  @Column({ name: 'command_topic_template', length: 200, default: 'xn/{productCode}/{deviceId}/webrtc_command' }) commandTopicTemplate!: string;
  @Column({ name: 'signal_topic_template', length: 200, default: 'xn/{productCode}/{deviceId}/webrtc_signal' }) signalTopicTemplate!: string;
  @Column({ default: true }) enabled!: boolean;
  @Column({ name: 'is_default', default: false }) isDefault!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
