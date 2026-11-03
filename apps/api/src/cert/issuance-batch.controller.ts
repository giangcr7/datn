import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthActor } from '../auth/auth-actor';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateIssuanceBatchDto,
  IssuanceBatchMembersDto,
  IssuanceBatchOptionsDto,
  IssuanceBatchQueryDto,
  PublishIssuanceBatchDto,
} from './issuance-batch.dto';
import { IssuanceBatchService } from './issuance-batch.service';

@Controller('cert/issuance-batches')
@ApiTags('diploma-issuance-batches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('university')
export class IssuanceBatchController {
  constructor(private readonly service: IssuanceBatchService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Query() query: IssuanceBatchQueryDto, @Req() req: { user: AuthActor }) {
    return this.service.list(query, req.user);
  }
  @Get('options')
  @Header('Cache-Control', 'private, no-store')
  options(
    @Query() query: IssuanceBatchOptionsDto,
    @Req() req: { user: AuthActor },
  ) {
    return this.service.options(query, req.user);
  }
  @Post()
  create(
    @Body() body: CreateIssuanceBatchDto,
    @Req() req: { user: AuthActor; ip?: string },
  ) {
    return this.service.create(body, req.user, req.ip);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: IssuanceBatchQueryDto,
    @Req() req: { user: AuthActor },
  ) {
    return this.service.detail(id, query, req.user);
  }
  @Get(':id/candidates')
  @Header('Cache-Control', 'private, no-store')
  candidates(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: IssuanceBatchQueryDto,
    @Req() req: { user: AuthActor },
  ) {
    return this.service.candidates(id, query, req.user);
  }
  @Post(':id/members')
  add(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: IssuanceBatchMembersDto,
    @Req() req: { user: AuthActor; ip?: string },
  ) {
    return this.service.changeMembers(id, body, true, req.user, req.ip);
  }
  @Post(':id/members/remove')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: IssuanceBatchMembersDto,
    @Req() req: { user: AuthActor; ip?: string },
  ) {
    return this.service.changeMembers(id, body, false, req.user, req.ip);
  }
  @Post(':id/publish')
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PublishIssuanceBatchDto,
    @Req() req: { user: AuthActor; ip?: string },
  ) {
    return this.service.publish(id, body, req.user, req.ip);
  }
}
