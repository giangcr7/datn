import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import type { Request } from 'express';
import type { AuthActor } from '../auth/auth-actor';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { InboxService } from './inbox.service';

export class ReadInboxDto {
  @IsString() @Matches(/^[a-z-]{1,80}$/) key!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
}
@ApiTags('inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inbox')
export class InboxController {
  constructor(private readonly service: InboxService) {}
  @Get() list(@Req() req: Request & { user: AuthActor }) {
    return this.service.list(req.user);
  }
  @Post('read') read(
    @Body() body: ReadInboxDto,
    @Req() req: Request & { user: AuthActor },
  ) {
    return this.service.read(body.key, body.fingerprint, req.user);
  }
}
