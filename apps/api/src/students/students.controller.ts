import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
  ) {
    return this.studentsService.findAll(+page, +limit, search);
  }

  @Post()
  create(@Body() body: { name: string; email: string; studentId: string }) {
    return this.studentsService.create(body.name, body.email, body.studentId);
  }

  @Post('import')
  importExcel(@Body() body: { fileName: string; fileData: string }) {
    return this.studentsService.importFromExcel(body.fileName, body.fileData);
  }
}
