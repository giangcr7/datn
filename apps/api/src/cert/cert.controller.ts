import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CertService } from './cert.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IssueCertDto } from '../common/dto/issue-cert.dto';
import { RevokeCertDto } from '../common/dto/revoke-cert.dto';
import { RequestCertDto } from '../common/dto/request-cert.dto';
import { ApproveCertDto } from '../common/dto/approve-cert.dto';
import { RejectCertDto } from '../common/dto/reject-cert.dto';

@ApiTags('cert')
@Controller('cert')
export class CertController {
  constructor(private readonly certService: CertService) {}

  // ===== LUỒNG CŨ (issue trực tiếp) — chỉ cán bộ trường (university) =====
  @Post('issue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  issue(@Body() body: IssueCertDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.certService.issue(body, user?.id, user?.email, ip);
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  revoke(@Body() body: RevokeCertDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.certService.revoke(
      body.certUUID,
      body.reason,
      user?.id,
      user?.email,
      ip,
    );
  }

  // ===== LUỒNG MỚI (2 bước) — chỉ cán bộ trường (university) =====
  @Post('request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  requestCert(@Body() body: RequestCertDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.certService.requestCert(body, user?.id, user?.email, ip);
  }

  @Post('approve/:uuid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  approveCert(
    @Param('uuid') uuid: string,
    @Body() body: ApproveCertDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.certService.approveCert(uuid, user?.id, user?.email, ip);
  }

  @Post('reject/:uuid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  rejectCert(
    @Param('uuid') uuid: string,
    @Body() body: RejectCertDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.certService.rejectCert(
      uuid,
      body.reason,
      user?.id,
      user?.email,
      ip,
    );
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @SkipThrottle()
  findPending() {
    return this.certService.findPending();
  }

  // ===== ROUTES CŨ — công khai / xem chung, giữ nguyên không đổi =====
  @Get('search')
  @Throttle({ medium: { ttl: 60000, limit: 30 } })
  search(@Query('q') q: string) {
    return this.certService.search(q);
  }

  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @SkipThrottle()
  statistics() {
    return this.certService.statistics();
  }

  @Get('student/:mssv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  findByMssv(@Param('mssv') mssv: string) {
    return this.certService.findByMssv(mssv);
  }

  @Get(':uuid')
  @SkipThrottle()
  findOne(@Param('uuid') uuid: string) {
    return this.certService.findOne(uuid);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @SkipThrottle()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    if (page || limit || search) {
      return this.certService.findAllPaginated(
        +(page || 1),
        +(limit || 20),
        search || '',
      );
    }
    return this.certService.findAll();
  }
}
