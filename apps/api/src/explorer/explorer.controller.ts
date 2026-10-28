import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ExplorerService } from './explorer.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthActor } from '../auth/auth-actor';
import type { Request } from 'express';
import { AnchorQueryDto } from './anchor-query.dto';
import { AnchorRetryDto } from './anchor-retry.dto';

type ExplorerRequest = Request & { user: AuthActor };

@ApiTags('Blockchain Explorer')
@Controller('explorer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'university')
@ApiBearerAuth()
@SkipThrottle({ short: true, medium: true })
export class ExplorerController {
  constructor(private readonly explorerService: ExplorerService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Lấy thông tin tổng quan mạng Blockchain và độ cao khối',
  })
  async getOverview(@Req() req: ExplorerRequest) {
    return this.explorerService.getOverview(req.user);
  }

  @Get('anchors')
  getAnchors(@Query() query: AnchorQueryDto, @Req() req: ExplorerRequest) {
    return this.explorerService.getAnchors(query, req.user);
  }

  @Post('anchors/:id/check')
  @SkipThrottle({ short: false, medium: false })
  @Throttle({ medium: { ttl: 60000, limit: 30 } })
  checkAnchor(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: ExplorerRequest,
  ) {
    return this.explorerService.checkAnchor(id, req.user, req.ip);
  }

  @Post('anchors/:id/retry')
  @SkipThrottle({ short: false, medium: false })
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  retryAnchor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AnchorRetryDto,
    @Req() req: ExplorerRequest,
  ) {
    return this.explorerService.retryAnchor(id, body, req.user, req.ip);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'Lấy danh sách các khối theo phân trang' })
  async getBlocks(
    @Req() req: ExplorerRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    return this.explorerService.getBlocks(
      Number(page),
      Number(limit),
      search,
      req.user,
    );
  }

  @Get('blocks/:number')
  @ApiOperation({ summary: 'Xem chi tiết một khối cụ thể' })
  getBlockDetails(
    @Param('number', ParseIntPipe) number: number,
    @Req() req: ExplorerRequest,
  ) {
    return this.explorerService.getBlockDetails(number, req.user);
  }

  @Get('tx/:txId')
  @ApiOperation({ summary: 'Xem chi tiết một giao dịch cụ thể' })
  async getTransactionDetails(
    @Param('txId') txId: string,
    @Req() req: ExplorerRequest,
  ) {
    return this.explorerService.getTransactionDetails(txId, req.user);
  }
}
