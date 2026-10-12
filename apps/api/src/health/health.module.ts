import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { FabricHealthIndicator } from './indicators/fabric-health.indicator';
import { FabricModule } from '../fabric/fabric.module';

@Module({
  imports: [TerminusModule, FabricModule],
  controllers: [HealthController],
  providers: [FabricHealthIndicator],
})
export class HealthModule {}
