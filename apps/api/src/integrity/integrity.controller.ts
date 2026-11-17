import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IntegrityService } from './integrity.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('integrity')
@Controller('integrity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'university')
@ApiBearerAuth()
@SkipThrottle()
export class IntegrityController {
  constructor(private readonly integrityService: IntegrityService) {}

  @Post('check')
  runCheck(
    @Query('days') days = '1',
    @Query('limit') limit = '50',
    @Req() req: any,
  ) {
    return this.integrityService.checkIncremental(+days, +limit, req.user);
  }

  @Get('debug')
  async debug() {
    return this.integrityService.debugCount();
  }

  @Get('alerts')
  getAlerts(
    @Query('resolved') resolved = 'false',
    @Query('severity') severity: string | undefined,
    @Query('limit') limit = '100',
    @Req() req: any,
  ) {
    return this.integrityService.getAlerts(resolved === 'true', req.user, {
      severity,
      limit: Number(limit),
    });
  }

  @Post('anomaly-scan')
  runAnomalyScan(
    @Query('days') days = '7',
    @Query('limit') limit = '500',
    @Req() req: any,
  ) {
    return this.integrityService.runAnomalyScan(
      Number(days),
      Number(limit),
      req.user,
    );
  }

  @Get('anomalies')
  getAnomalies(
    @Query('resolved') resolved = 'false',
    @Query('severity') severity: string | undefined,
    @Query('limit') limit = '100',
    @Req() req: any,
  ) {
    return this.integrityService.getAnomalies(
      resolved === 'true',
      req.user,
      severity,
      Number(limit),
    );
  }

  @Post('alerts/:id/resolve')
  resolveAlert(
    @Param('id') id: string,
    @Body() body: { note: string },
    @Req() req: any,
  ) {
    return this.integrityService.resolveAlert(id, body.note, req.user);
  }

  @Post('anomalies/:id/resolve')
  resolveAnomaly(
    @Param('id') id: string,
    @Body() body: { note: string },
    @Req() req: any,
  ) {
    return this.integrityService.resolveAlert(id, body.note, req.user);
  }

  @Post('anomalies/:id/reopen')
  reopenAnomaly(
    @Param('id') id: string,
    @Body() body: { note: string },
    @Req() req: any,
  ) {
    return this.integrityService.reopenAlert(id, body.note, req.user);
  }
}
