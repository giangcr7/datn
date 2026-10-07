import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true }) email: string;
  @Prop({ required: true }) password: string;
  @Prop({ required: true }) name: string;
  @Prop({ unique: true, sparse: true }) mssv: string;
  @Prop({
    type: String,
    enum: ['university', 'student', 'employer', 'admin'],
    default: 'student',
  })
  role: string;
  @Prop() fabricEnrollmentId: string;
  @Prop({ default: false }) mustChangePassword: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Performance Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ fabricEnrollmentId: 1 });
