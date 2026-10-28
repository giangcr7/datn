import { Global, Module } from '@nestjs/common';
import { DocumentStorageService } from '../storage/document-storage.service';
import { PdfSignatureService } from './pdf-signature.service';

@Global()
@Module({
  providers: [PdfSignatureService, DocumentStorageService],
  exports: [PdfSignatureService],
})
export class PdfSignatureModule {}
