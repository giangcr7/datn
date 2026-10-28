import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CertModule } from './cert/cert.module';
import { VerifyModule } from './verify/verify.module';
import { FabricModule } from './fabric/fabric.module';
import { NotifyModule } from './notify/notify.module';
import { StudentsModule } from './students/students.module';
import { AuditModule } from './audit/audit.module';
import { CatalogModule } from './catalog/catalog.module';
import { IntegrityModule } from './integrity/integrity.module';
import { envValidationSchema } from './config/env.validation';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './config/logger.config';
import { HealthModule } from './health/health.module';
import { ExplorerModule } from './explorer/explorer.module';
import { DatabaseModule } from './database/database.module';
import { OutboxModule } from './outbox/outbox.module';
import { RegistryImportModule } from './imports/registry-import.module';
import { PdfSignatureModule } from './signatures/pdf-signature.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    DatabaseModule,
    PdfSignatureModule,
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 5 },
      { name: 'medium', ttl: 60000, limit: 60 },
    ]),
    ScheduleModule.forRoot(),
    WinstonModule.forRoot(winstonConfig),
    AuthModule,
    CertModule,
    VerifyModule,
    FabricModule,
    NotifyModule,
    StudentsModule,
    AuditModule,
    CatalogModule,
    DashboardModule,
    IntegrityModule,
    HealthModule,
    ExplorerModule,
    OutboxModule,
    RegistryImportModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
