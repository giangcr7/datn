import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@SkipThrottle()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('action') action?: string,
  ) {
    return this.auditService.findAll(+page, +limit, action);
  }

  @Get('user/:userId')
  findByUser(@Query('userId') userId: string) {
    return this.auditService.findByUser(userId);
  }
}
