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
import { CorrectionActionDto, CorrectionEditDto } from './correction.dto';
import { CreateReplacementDto, ReplacementQueryDto } from './replacement.dto';
import { ReplacementService } from './replacement.service';

type OfficerRequest = { user: AuthActor; ip?: string };

@Controller('cert/replacements')
@ApiTags('diploma-replacements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('university')
export class ReplacementController {
  constructor(private readonly service: ReplacementService) {}
  @Get()
  list(@Query() query: ReplacementQueryDto, @Req() request: OfficerRequest) {
    return this.service.list(query, request.user);
  }
  @Post(':uuid/create')
  create(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CreateReplacementDto,
    @Req() request: OfficerRequest,
  ) {
    return this.service.create(uuid, body, request.user, request.ip);
  }
  @Patch(':uuid')
  revise(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionEditDto,
    @Req() request: OfficerRequest,
  ) {
    return this.service.revise(uuid, body, request.user, request.ip);
  }
  @Post(':uuid/submit')
  submit(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionActionDto,
    @Req() request: OfficerRequest,
  ) {
    return this.service.transition(
      uuid,
      body,
      request.user,
      'submit',
      request.ip,
    );
  }
  @Post(':uuid/reopen')
  reopen(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionActionDto,
    @Req() request: OfficerRequest,
  ) {
    return this.service.transition(
      uuid,
      body,
      request.user,
      'reopen',
      request.ip,
    );
  }
  @Post(':uuid/reject')
  reject(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionActionDto,
    @Req() request: OfficerRequest,
  ) {
    return this.service.transition(
      uuid,
      body,
      request.user,
      'reject',
      request.ip,
    );
  }
  @Post(':uuid/approve')
  approve(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: CorrectionActionDto,
    @Req() request: OfficerRequest,
  ) {
    return this.service.approve(uuid, body, request.user, request.ip);
  }
}
