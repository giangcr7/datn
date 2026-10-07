import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IntegrityAlertDocument = IntegrityAlert & Document;

@Schema({ timestamps: true })
export class IntegrityAlert {
  @Prop({ required: true }) uuid: string;
  @Prop({ required: true }) mssv: string;
  @Prop({ required: true }) fullName: string;
  @Prop({ required: true }) type: string; // HASH_MISMATCH, NOT_ON_CHAIN, REVOKED_MISMATCH
  @Prop() mongoHash: string;
  @Prop() fabricHash: string;
  @Prop({ default: false }) resolved: boolean;
  @Prop() resolvedAt: Date;
  @Prop() note: string;
}

export const IntegrityAlertSchema =
  SchemaFactory.createForClass(IntegrityAlert);
