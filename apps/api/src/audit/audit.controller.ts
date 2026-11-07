import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuditService, type SecurityAlertStatus } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthActor } from '../auth/auth-actor';
import { AuditQueryDto } from './audit-query.dto';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'university')
@ApiBearerAuth()
@SkipThrottle()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Req() req: { user: AuthActor }, @Query() query: AuditQueryDto) {
    return this.auditService.findAll(
      req.user,
      query.page,
      query.limit,
      query.action,
      query,
    );
  }

  @Get('security-summary')
  securitySummary(@Req() req: { user: AuthActor }) {
    return this.auditService.securitySummary(req.user);
  }

  @Get(':id/related')
  findRelated(@Param('id') id: string, @Req() req: { user: AuthActor }) {
    return this.auditService.findRelated(id, req.user);
  }

  @Post('security-alerts/:id/status')
  updateSecurityAlertStatus(
    @Param('id') id: string,
    @Body() body: { status?: SecurityAlertStatus; note?: string },
    @Req() req: { user: AuthActor; ip?: string },
  ) {
    return this.auditService.updateSecurityAlertStatus(
      id,
      body.status as SecurityAlertStatus,
      body.note,
      req.user,
      req.ip,
    );
  }

  @Get('user/:userId')
  @Roles('admin')
  findByUser(@Param('userId') userId: string, @Req() req: { user: AuthActor }) {
    return this.auditService.findByUser(userId, req.user);
  }
}
