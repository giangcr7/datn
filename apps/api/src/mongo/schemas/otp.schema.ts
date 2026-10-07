import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpDocument = Otp & Document;

@Schema({ timestamps: true })
export class Otp {
  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true, index: true })
  mssv: string;

  @Prop({ required: true })
  otp: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL index: tự động xóa bản ghi OTP sau khi hết hạn
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
