import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthActor } from '../auth/auth-actor';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'university')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  overview(@Req() request: { user: AuthActor }) {
    return this.service.overview(request.user);
  }
}
