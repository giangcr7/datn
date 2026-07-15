import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrityService } from './integrity.service';
import { IntegrityController } from './integrity.controller';
import { FabricModule } from '../fabric/fabric.module';
import { NotifyModule } from '../notify/notify.module';
import { Certificate, CertificateSchema } from '../mongo/schemas/certificate.schema';
import { IntegrityAlert, IntegrityAlertSchema } from '../mongo/schemas/integrity-alert.schema';

@Module({
  imports: [
    FabricModule,
    NotifyModule,
    MongooseModule.forFeature([
      { name: Certificate.name, schema: CertificateSchema },
      { name: IntegrityAlert.name, schema: IntegrityAlertSchema },
    ]),
  ],
  controllers: [IntegrityController],
  providers: [IntegrityService],
})
export class IntegrityModule {}
