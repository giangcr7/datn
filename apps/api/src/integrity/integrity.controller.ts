import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IntegrityService } from './integrity.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('integrity')
@Controller('integrity')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@SkipThrottle()
export class IntegrityController {
  constructor(private readonly integrityService: IntegrityService) {}

  @Post('check')
  runCheck(@Query('days') days = '1', @Query('limit') limit = '50') {
    return this.integrityService.checkIncremental(+days, +limit);
  }

  @Get('debug')
  async debug() {
    return this.integrityService.debugCount();
  }

  @Get('alerts')
  getAlerts(@Query('resolved') resolved = 'false') {
    return this.integrityService.getAlerts(resolved === 'true');
  }

  @Post('alerts/:id/resolve')
  resolveAlert(@Param('id') id: string, @Body() body: { note: string }) {
    return this.integrityService.resolveAlert(id, body.note);
  }
}
