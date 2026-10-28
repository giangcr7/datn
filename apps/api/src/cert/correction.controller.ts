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
import type { AuthActor } from '../auth/auth-actor';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import {
  CorrectionActionDto,
  CorrectionEditDto,
  CorrectionQueryDto,
} from './correction.dto';
import { CorrectionService } from './correction.service';

@Controller('cert/corrections')
@ApiTags('diploma-corrections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('university')
export class CorrectionController {
  constructor(private readonly service: CorrectionService) {}
  @Get()
  list(
    @Query() query: CorrectionQueryDto,
    @Req() request: { user: AuthActor },
  ) {
    return this.service.list(query, request.user);
  }
  @Post(':uuid/reopen')
  reopen(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionActionDto,
    @Req() request: { user: AuthActor; ip?: string },
  ) {
    return this.service.reopen(uuid, body, request.user, request.ip);
  }
  @Patch(':uuid')
  revise(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionEditDto,
    @Req() request: { user: AuthActor; ip?: string },
  ) {
    return this.service.revise(uuid, body, request.user, request.ip);
  }
  @Post(':uuid/resubmit')
  resubmit(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionActionDto,
    @Req() request: { user: AuthActor; ip?: string },
  ) {
    return this.service.resubmit(uuid, body, request.user, request.ip);
  }
}
