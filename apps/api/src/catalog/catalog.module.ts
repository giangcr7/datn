import { Module } from '@nestjs/common';
import { RegistryImportModule } from '../imports/registry-import.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [RegistryImportModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
