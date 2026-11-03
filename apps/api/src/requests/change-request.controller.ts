import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthActor } from '../auth/auth-actor';
import { JwtAuthGuard } from '../auth/jwt.guard';
import {
  ChangeRequestActionDto,
  ChangeRequestQueryDto,
  CreateChangeRequestDto,
} from './change-request.dto';
import { ChangeRequestService } from './change-request.service';

@ApiTags('change-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('change-requests')
export class ChangeRequestController {
  constructor(private readonly service: ChangeRequestService) {}
  @Get() list(
    @Query() query: ChangeRequestQueryDto,
    @Req() req: Request & { user: AuthActor },
  ) {
    return this.service.list(query, req.user);
  }
  @Get('eligible') eligible(@Req() req: Request & { user: AuthActor }) {
    return this.service.eligible(req.user);
  }
  @Post() create(
    @Body() body: CreateChangeRequestDto,
    @Req() req: Request & { user: AuthActor },
  ) {
    return this.service.create(body, req.user, req.ip);
  }
  @Post(':id/action') act(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeRequestActionDto,
    @Req() req: Request & { user: AuthActor },
  ) {
    return this.service.act(id, body, req.user, req.ip);
  }
}
