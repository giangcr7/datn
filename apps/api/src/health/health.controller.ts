import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { FabricHealthIndicator } from './indicators/fabric-health.indicator';

@Controller('health')
@SkipThrottle({ short: true, medium: true })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseService,
    private readonly memory: MemoryHealthIndicator,
    private readonly fabric: FabricHealthIndicator,
  ) {}
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        const started = Date.now();
        await this.database.$queryRaw`SELECT 1`;
        return { database: { status: 'up', latencyMs: Date.now() - started } };
      },
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.fabric.isHealthy('fabric'),
    ]);
  }
}
