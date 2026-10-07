import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ExplorerService } from './explorer.service';

@ApiTags('Blockchain Explorer')
@Controller('explorer')
@SkipThrottle({ short: true, medium: true })
export class ExplorerController {
  constructor(private readonly explorerService: ExplorerService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Lấy thông tin tổng quan mạng Blockchain và độ cao khối',
  })
  async getOverview() {
    return this.explorerService.getOverview();
  }

  @Get('blocks')
  @ApiOperation({ summary: 'Lấy danh sách các khối theo phân trang' })
  async getBlocks(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    return this.explorerService.getBlocks(Number(page), Number(limit), search);
  }

  @Get('blocks/:number')
  @ApiOperation({ summary: 'Xem chi tiết một khối cụ thể' })
  async getBlockDetails(@Param('number') number: string) {
    return this.explorerService.getBlockDetails(Number(number));
  }

  @Get('tx/:txId')
  @ApiOperation({ summary: 'Xem chi tiết một giao dịch cụ thể' })
  async getTransactionDetails(@Param('txId') txId: string) {
    return this.explorerService.getTransactionDetails(txId);
  }
}
