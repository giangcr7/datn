import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExplorerController } from './explorer.controller';
import { ExplorerService } from './explorer.service';
import {
  Certificate,
  CertificateSchema,
} from '../mongo/schemas/certificate.schema';
import { AuditLog, AuditLogSchema } from '../mongo/schemas/audit-log.schema';
import { FabricModule } from '../fabric/fabric.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Certificate.name, schema: CertificateSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    FabricModule,
  ],
  controllers: [ExplorerController],
  providers: [ExplorerService],
  exports: [ExplorerService],
})
export class ExplorerModule {}
