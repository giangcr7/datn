import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ required: true, index: true })
  userId: string;

  // Lưu hash (SHA-256) của refresh token, KHÔNG lưu plaintext —
  // giống nguyên tắc không lưu password thô.
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isRevoked: boolean;

  // Truy vết chuỗi rotation — token nào đã thay thế token này
  @Prop()
  replacedByTokenHash?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// TTL index — MongoDB tự động xoá document sau khi expiresAt qua,
// không cần cron job dọn rác thủ công.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });