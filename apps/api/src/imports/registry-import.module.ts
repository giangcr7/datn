import { Module } from '@nestjs/common';
import { RegistryImportService } from './registry-import.service';
import { RegistryImportController } from './registry-import.controller';
import { DocumentStorageService } from '../storage/document-storage.service';

@Module({
  controllers: [RegistryImportController],
  providers: [RegistryImportService, DocumentStorageService],
  exports: [RegistryImportService],
})
export class RegistryImportModule {}
