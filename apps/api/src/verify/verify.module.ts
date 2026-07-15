import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerifyService } from './verify.service';
import { VerifyController } from './verify.controller';
import { FabricModule } from '../fabric/fabric.module';
import { Certificate, CertificateSchema } from '../mongo/schemas/certificate.schema';

@Module({
  imports: [
    FabricModule,
    MongooseModule.forFeature([{ name: Certificate.name, schema: CertificateSchema }]),
  ],
  controllers: [VerifyController],
  providers: [VerifyService],
})
export class VerifyModule {}
