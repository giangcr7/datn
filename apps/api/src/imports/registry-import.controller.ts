import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RegistryImportService } from './registry-import.service';
import {
  RegistryImportDto,
  ReviewRegistryRowDto,
  ProgramAliasDto,
  CommitRegistryDto,
} from '../common/dto/registry-import.dto';

@ApiTags('imports')
@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('university')
@ApiBearerAuth()
export class RegistryImportController {
  constructor(private readonly service: RegistryImportService) {}
  @Post('registry/preview') preview(
    @Body() body: RegistryImportDto,
    @Req() req: any,
  ) {
    return this.service.preview(body.fileName, body.fileData, req.user);
  }
  @Post('registry') import(@Body() body: RegistryImportDto, @Req() req: any) {
    return this.service.import(body.fileName, body.fileData, req.user);
  }
  @Get('programs') programs(@Req() req: any) {
    return this.service.programs(req.user);
  }
  @Get() list(
    @Req() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.list(req.user, +page, +limit);
  }
  @Get(':batchId/rows') rows(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Req() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('rowId', new ParseUUIDPipe({ optional: true })) rowId?: string,
  ) {
    return this.service.rows(batchId, req.user, +page, +limit, status, rowId);
  }
  @Patch(':batchId/rows/:rowId') review(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Param('rowId', new ParseUUIDPipe()) rowId: string,
    @Body() body: ReviewRegistryRowDto,
    @Req() req: any,
  ) {
    return this.service.review(
      batchId,
      rowId,
      body.corrections,
      body.note,
      req.user,
    );
  }
  @Post(':batchId/commit') commit(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Body() body: CommitRegistryDto,
    @Req() req: any,
  ) {
    return this.service.commit(batchId, req.user, body.originType);
  }
  @Post(':batchId/recheck') recheck(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Req() req: any,
  ) {
    return this.service.recheck(batchId, req.user);
  }
  @Post('program-aliases') alias(
    @Body() body: ProgramAliasDto,
    @Req() req: any,
  ) {
    return this.service.addProgramAlias(
      body.programId,
      body.originalName,
      body.note,
      req.user,
    );
  }
}
