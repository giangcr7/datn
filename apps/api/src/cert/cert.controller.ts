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
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IssueCertDto } from '../common/dto/issue-cert.dto';
import { RevokeCertDto } from '../common/dto/revoke-cert.dto';
import { RequestCertDto } from '../common/dto/request-cert.dto';
import { ApproveCertDto } from '../common/dto/approve-cert.dto';
import { RejectCertDto } from '../common/dto/reject-cert.dto';
import { SubmitDiplomaDto } from '../common/dto/submit-diploma.dto';

@ApiTags('cert')
@Controller('cert')
export class CertController {
  constructor(private readonly certService: CertService) {}
  @Post('issue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  issue(@Body() body: IssueCertDto) {
    return this.certService.issue(body);
  }
  @Post('revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  revoke(@Body() body: RevokeCertDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.certService.revoke(body.certUUID, body.reason, user, req.ip);
  }
  @Post('request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  requestCert(@Body() body: RequestCertDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.certService.requestCert(body, user, req.ip);
  }
  @Post('approve/:uuid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  approveCert(
    @Param('uuid') uuid: string,
    @Body() _body: ApproveCertDto,
    @Req() req: Request,
  ) {
    return this.certService.approveCert(uuid, (req as any).user, req.ip);
  }
  @Post(':uuid/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  submit(
    @Param('uuid') uuid: string,
    @Body() body: SubmitDiplomaDto,
    @Req() req: Request,
  ) {
    return this.certService.submitDraft(uuid, body.issuedOn, (req as any).user);
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
    return this.certService.rejectCert(
      uuid,
      body.reason,
      (req as any).user,
      req.ip,
    );
  }
  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @SkipThrottle()
  findPending(@Req() req: Request) {
    return this.certService.findPending((req as any).user);
  }
  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ medium: { ttl: 60000, limit: 30 } })
  search(@Query('q') q: string, @Req() req: Request) {
    return this.certService.search(q, (req as any).user);
  }
  @Get('statistics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university', 'student')
  @ApiBearerAuth()
  @SkipThrottle()
  statistics(@Req() req: Request) {
    return this.certService.statistics((req as any).user);
  }
  @Get('student/:mssv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university', 'student')
  @ApiBearerAuth()
  findByMssv(@Param('mssv') mssv: string, @Req() req: Request) {
    return this.certService.findByMssv(mssv, (req as any).user);
  }
  @Get(':uuid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university', 'student')
  @ApiBearerAuth()
  findOne(@Param('uuid') uuid: string, @Req() req: Request) {
    return this.certService.findOne(uuid, (req as any).user);
  }
  @Get(':uuid/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  history(@Param('uuid') uuid: string, @Req() req: Request) {
    return this.certService.history(uuid, (req as any).user);
  }
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university', 'student')
  @ApiBearerAuth()
  @SkipThrottle()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Req() req?: Request,
  ) {
    const actor = (req as any)?.user;
    if (page || limit || search)
      return this.certService.findAllPaginated(
        +(page || 1),
        +(limit || 20),
        search || '',
        actor,
      );
    return this.certService.findAll(actor);
  }
}
