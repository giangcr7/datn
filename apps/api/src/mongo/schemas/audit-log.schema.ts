import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) userEmail: string;
  @Prop({ required: true }) action: string;
  @Prop() target: string;
  @Prop() ip: string;
  @Prop() userAgent: string;
  @Prop({ default: 'SUCCESS' }) result: string;
  @Prop() errorMessage: string;
  @Prop({ type: Object }) metadata: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Performance Indexes for sorting and filtering
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
