import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { FabricHealthIndicator } from './indicators/fabric-health.indicator';

@Controller('health')
@SkipThrottle({ short: true, medium: true }) // phải chỉ rõ tên từng throttler — 'default' không khớp vì app dùng tên 'short'/'medium'
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private memory: MemoryHealthIndicator,
    private fabric: FabricHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.fabric.isHealthy('fabric'),
    ]);
  }
}
