import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateStudentDto } from '../common/dto/create-student.dto';
import { ImportStudentsDto } from '../common/dto/import-students.dto';

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
  @UseGuards(RolesGuard)
  @Roles('university')
  create(@Body() body: CreateStudentDto) {
    return this.studentsService.create(body.name, body.email, body.studentId);
  }

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('university')
  importExcel(@Body() body: ImportStudentsDto) {
    return this.studentsService.importFromExcel(body.fileName, body.fileData);
  }
}
