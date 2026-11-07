import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDiplomaShareDto } from '../common/dto/create-diploma-share.dto';
import { VerifyDiplomaShareDto } from '../common/dto/verify-diploma-share.dto';
import { ShareService } from './share.service';

@ApiTags('shares')
@Controller('shares')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  create(@Body() body: CreateDiplomaShareDto, @Req() req: Request) {
    return this.shareService.create(
      body.diplomaId,
      body.recipientEmail,
      body.expiresInHours,
      (req as any).user,
      req.ip,
    );
  }

  @Post('verify')
  @Throttle({ medium: { ttl: 60000, limit: 30 } })
  verify(@Body() body: VerifyDiplomaShareDto) {
    return this.shareService.verify(body.token);
  }

  @Post(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @ApiBearerAuth()
  @Throttle({ short: { ttl: 60000, limit: 20 } })
  revoke(@Param('id') id: string, @Req() req: Request) {
    return this.shareService.revoke(id, (req as any).user);
  }
}
