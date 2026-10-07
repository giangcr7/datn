import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertService } from './cert.service';
import { CertController } from './cert.controller';
import { FabricModule } from '../fabric/fabric.module';
import { NotifyModule } from '../notify/notify.module';
import { AuditModule } from '../audit/audit.module';
import {
  Certificate,
  CertificateSchema,
} from '../mongo/schemas/certificate.schema';
import { User, UserSchema } from '../mongo/schemas/user.schema';

@Module({
  imports: [
    FabricModule,
    NotifyModule,
    AuditModule,
    MongooseModule.forFeature([
      { name: Certificate.name, schema: CertificateSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CertController],
  providers: [CertService],
  exports: [CertService],
})
export class CertModule {}
