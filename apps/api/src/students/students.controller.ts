import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
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

  @Get('import-template')
  @UseGuards(RolesGuard)
  @Roles('university')
  async importTemplate(@Res() response: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('DanhSachSinhVien');
    sheet.addRows([
      ['MSSV', 'Họ và tên', 'Email'],
      ['0099999981', 'Sinh viên Mẫu Một', 'student.one@example.com'],
      ['0099999982', 'Sinh viên Mẫu Hai', 'student.two@example.com'],
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="Template_DanhSachSinhVien.xlsx"',
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(buffer);
  }

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
    @Req() req?: any,
  ) {
    return this.studentsService.findAll(+page, +limit, search, req.user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('university')
  create(@Body() body: CreateStudentDto, @Req() req: any) {
    return this.studentsService.create(
      body.name,
      body.email,
      body.studentId,
      req.user,
    );
  }

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('university')
  importExcel(@Body() body: ImportStudentsDto, @Req() req: any) {
    return this.studentsService.importFromExcel(
      body.fileName,
      body.fileData,
      req.user,
    );
  }

  @Post(':id/resend-password')
  @UseGuards(RolesGuard)
  @Roles('university')
  resendPassword(@Param('id') id: string, @Req() req: any) {
    return this.studentsService.resendTemporaryPassword(id, req.user);
  }
}
