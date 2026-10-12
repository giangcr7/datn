import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { FabricService } from '../../fabric/fabric.service';

@Injectable()
export class FabricHealthIndicator extends HealthIndicator {
  constructor(private readonly fabric: FabricService) {
    super();
  }
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const result = await this.fabric.checkConnection();
    const status = this.getStatus(
      key,
      result.connected || !!result.disabled,
      result,
    );
    if (!result.connected && !result.disabled)
      throw new HealthCheckError('Fabric không sẵn sàng', status);
    return status;
  }
}
