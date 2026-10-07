import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { FabricService } from '../../fabric/fabric.service';

@Injectable()
export class FabricHealthIndicator extends HealthIndicator {
  constructor(private readonly fabricService: FabricService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const { connected, latencyMs, error } =
      await this.fabricService.checkConnection();
    const status = this.getStatus(key, connected, { latencyMs, error });

    if (!connected) {
      throw new HealthCheckError('Fabric peer không phản hồi', status);
    }
    return status;
  }
}
