import { Module } from '@nestjs/common';
import { CertService } from './cert.service';
import { CertController } from './cert.controller';
import { CorrectionController } from './correction.controller';
import { CorrectionService } from './correction.service';
import { ReplacementController } from './replacement.controller';
import { ReplacementService } from './replacement.service';

@Module({
  controllers: [CorrectionController, ReplacementController, CertController],
  providers: [CertService, CorrectionService, ReplacementService],
  exports: [CertService],
})
export class CertModule {}
