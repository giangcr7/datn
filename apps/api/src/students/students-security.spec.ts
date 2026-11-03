import {
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import type { Server } from 'node:http';
import request from 'supertest';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

describe('student import security', () => {
  it('checks expanded ZIP size before parsing or writing student data', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Students').addRows([
      ['MSSV', 'Họ và tên', 'Email'],
      ['FIXTURE', 'Fixture', 'fixture@example.invalid'],
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const directory = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(directory).toBeGreaterThan(0);
    buffer.writeUInt32LE(65 * 1024 * 1024, directory + 24);
    const database = { $transaction: jest.fn() };
    const service = new StudentsService(database as never);
    await expect(
      service.importFromExcel('fixture.xlsx', buffer.toString('base64'), {
        role: 'university',
      } as never),
    ).rejects.toThrow('64 MB');
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

describe('authenticated Excel template download', () => {
  let app: INestApplication<Server>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [{ provide: StudentsService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const incoming = context.switchToHttp().getRequest<{
            headers: Record<string, string | undefined>;
            user?: { role?: string };
          }>();
          if (incoming.headers.authorization !== 'Bearer fixture')
            throw new UnauthorizedException();
          incoming.user = { role: incoming.headers['x-fixture-role'] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('keeps the existing two-row workbook template and leading zeroes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/students/import-template')
      .set('Authorization', 'Bearer fixture')
      .set('X-Fixture-Role', 'university')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', callback);
      })
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toContain(
      'Template_DanhSachSinhVien.xlsx',
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(response.body as Buffer).buffer);
    const sheet = workbook.getWorksheet('DanhSachSinhVien')!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell('A2').value).toBe('0099999981');
    expect(sheet.getCell('B2').value).toBe('Sinh viên Mẫu Một');
  });

  it('does not expose a staff download route to anonymous requests', async () => {
    await request(app.getHttpServer())
      .get('/api/students/import-template')
      .expect(401);
  });
  it.each(['student', 'employer', 'admin'])(
    'does not let %s use the import template endpoint',
    async (role) => {
      await request(app.getHttpServer())
        .get('/api/students/import-template')
        .set('Authorization', 'Bearer fixture')
        .set('X-Fixture-Role', role)
        .expect(403);
    },
  );
});
