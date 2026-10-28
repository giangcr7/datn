import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthActor } from '../auth/auth-actor';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProgramAliasDto } from '../common/dto/registry-import.dto';
import { RegistryImportService } from '../imports/registry-import.service';
import { CatalogService } from './catalog.service';
import { SaveProgramDto } from './catalog.dto';

@ApiTags('catalog')
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('university')
@ApiBearerAuth()
export class CatalogController {
  constructor(
    private readonly service: CatalogService,
    private readonly imports: RegistryImportService,
  ) {}

  @Get('programs')
  list(@Req() req: { user: AuthActor }) {
    return this.service.list(req.user);
  }

  @Post('programs')
  create(@Body() body: SaveProgramDto, @Req() req: { user: AuthActor }) {
    return this.service.save(body, req.user);
  }

  @Patch('programs/:id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SaveProgramDto,
    @Req() req: { user: AuthActor },
  ) {
    return this.service.save(body, req.user, id);
  }

  @Post('program-aliases')
  alias(@Body() body: ProgramAliasDto, @Req() req: { user: AuthActor }) {
    return this.imports.addProgramAlias(
      body.programId,
      body.originalName,
      body.note,
      req.user,
    );
  }
}
