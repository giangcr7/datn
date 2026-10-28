import { Controller, Get, Query, UseGuards, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuditService } from './audit.service';
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

  @Get('user/:userId')
  @Roles('admin')
  findByUser(@Param('userId') userId: string, @Req() req: { user: AuthActor }) {
    return this.auditService.findByUser(userId, req.user);
  }
}
