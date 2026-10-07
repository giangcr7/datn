import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { FabricHealthIndicator } from './indicators/fabric-health.indicator';
import { FabricModule } from '../fabric/fabric.module'; // <-- Đảm bảo đường dẫn này đúng

@Module({
  imports: [
    TerminusModule,
    FabricModule, // Import module cung cấp FabricService
  ],
  controllers: [HealthController],
  providers: [FabricHealthIndicator],
})
export class HealthModule {}
