import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CertService } from './cert.service';
import { RegisterQueryDto } from './register-query.dto';
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
import {
  BulkPrintDiplomaDto,
  PrintDiplomaDataDto,
} from '../common/dto/print-diploma.dto';
import {
  BulkDiplomaDto,
  BulkRejectDiplomaDto,
} from '../common/dto/bulk-diploma.dto';

@ApiTags('cert')
@Controller('cert')
export class CertController {
  constructor(private readonly certService: CertService) {}
  @Get('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'university')
  @ApiBearerAuth()
  @SkipThrottle()
  register(@Query() query: RegisterQueryDto, @Req() req: Request) {
    return this.certService.findRegister(query, (req as any).user);
  }
  @Get('candidates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @SkipThrottle()
  candidates(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
    @Query('batchId') batchId?: string,
  ) {
    return this.certService.findRequestCandidates(
      +page,
      +limit,
      search,
      batchId,
      (req as any).user,
    );
  }
  @Post('bulk/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 60 } })
  bulkSubmit(@Body() body: BulkDiplomaDto, @Req() req: Request) {
    return this.certService.processBulk(
      'submit',
      body.diplomaIds,
      (req as any).user,
      undefined,
      req.ip,
    );
  }
  @Post('bulk/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 60 } })
  bulkApprove(@Body() body: BulkDiplomaDto, @Req() req: Request) {
    return this.certService.processBulk(
      'approve',
      body.diplomaIds,
      (req as any).user,
      undefined,
      req.ip,
    );
  }
  @Post('bulk/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 60 } })
  bulkReject(@Body() body: BulkRejectDiplomaDto, @Req() req: Request) {
    return this.certService.processBulk(
      'reject',
      body.diplomaIds,
      (req as any).user,
      body.reason,
      req.ip,
    );
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  @Throttle({ medium: { ttl: 60000, limit: 60 } })
  @Post('bulk/print-data')
  bulkPrintData(@Body() body: BulkPrintDiplomaDto, @Req() req: Request) {
    return this.certService.updateBulkPrintData(
      body.diplomaIds,
      body.printData,
      (req as any).user,
    );
  }
  @Patch(':uuid/print-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  printData(
    @Param('uuid') uuid: string,
    @Body() body: PrintDiplomaDataDto,
    @Req() req: Request,
  ) {
    return this.certService.updatePrintData(uuid, body, (req as any).user);
  }
  @Get(':uuid/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  async preview(
    @Param('uuid') uuid: string,
    @Req() req: Request,
    @Res() response: Response,
  ) {
    const bytes = await this.certService.previewPdf(uuid, (req as any).user);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="diploma-preview.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(bytes);
  }
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
  @Roles('admin', 'university')
  @ApiBearerAuth()
  @SkipThrottle()
  findPending(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search = '',
    @Query('batchId') batchId?: string,
  ) {
    if (page || limit || search || batchId)
      return this.certService.findPendingPaginated(
        +(page || 1),
        +(limit || 20),
        search,
        batchId,
        (req as any).user,
      );
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
  @Roles('admin', 'university', 'student')
  @ApiBearerAuth()
  @SkipThrottle()
  statistics(@Req() req: Request) {
    return this.certService.statistics((req as any).user);
  }
  @Get('student/:mssv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'university', 'student')
  @ApiBearerAuth()
  findByMssv(@Param('mssv') mssv: string, @Req() req: Request) {
    return this.certService.findByMssv(mssv, (req as any).user);
  }
  @Post(':uuid/sign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('university')
  @ApiBearerAuth()
  signExisting(@Param('uuid') uuid: string, @Req() req: Request) {
    return this.certService.signExistingRequest(uuid, (req as any).user);
  }

  @Get(':uuid/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'university', 'student')
  @ApiBearerAuth()
  async downloadPdf(
    @Param('uuid') uuid: string,
    @Query('stage') stage: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.certService.downloadPdf(
      uuid,
      (req as any).user,
      stage === 'campus',
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition':
        'attachment; filename="VanBang_' +
        uuid.replace(/[^a-zA-Z0-9-]/g, '') +
        (stage === 'campus' ? '_campus' : '_signed') +
        '.pdf"',
    });
    res.send(buffer);
  }

  @Get(':uuid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'university', 'student')
  @ApiBearerAuth()
  findOne(@Param('uuid') uuid: string, @Req() req: Request) {
    return this.certService.findOne(uuid, (req as any).user);
  }
  @Get(':uuid/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'university')
  @ApiBearerAuth()
  history(@Param('uuid') uuid: string, @Req() req: Request) {
    return this.certService.history(uuid, (req as any).user);
  }
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'university', 'student')
  @ApiBearerAuth()
  @SkipThrottle()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('issuedOnly', new ParseBoolPipe({ optional: true }))
    issuedOnly?: boolean,
    @Req() req?: Request,
  ) {
    const actor = (req as any)?.user;
    if (page || limit || search || issuedOnly)
      return this.certService.findAllPaginated(
        +(page || 1),
        +(limit || 20),
        search || '',
        actor,
        issuedOnly,
      );
    return this.certService.findAll(actor);
  }
}
