import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthActor } from '../auth/auth-actor';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RegisterQueryDto } from '../cert/register-query.dto';
import { ReportExportQueryDto } from './report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'university')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('overview')
  @Header('Cache-Control', 'private, no-store')
  overview(
    @Query() query: RegisterQueryDto,
    @Req() request: { user: AuthActor },
  ) {
    return this.service.overview(query, request.user);
  }

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async export(
    @Query() query: ReportExportQueryDto,
    @Req() request: { user: AuthActor },
  ) {
    const result = await this.service.export(query, request.user);
    return new StreamableFile(result.data, {
      type: result.contentType,
      disposition: 'attachment; filename="' + result.filename + '"',
      length: result.data.length,
    });
  }
}
