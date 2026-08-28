import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import * as FileType from 'file-type';
import { User, UserDocument } from '../mongo/schemas/user.schema';
import { NotifyService } from '../notify/notify.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

// MIME thật (dò từ nội dung buffer, không tin đuôi file/header client gửi)
// .xlsx = OOXML zip -> nhận diện chính xác qua file-type
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notify: NotifyService,
  ) {}

  async findAll(page: number, limit: number, search: string) {
    const query: any = { role: 'student' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fabricEnrollmentId: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [students, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(query),
    ]);
    const data = students.map((s: any) => ({
      id: s._id.toString(),
      name: s.name,
      email: s.email,
      studentId: s.fabricEnrollmentId || s.mssv || 'Chưa định danh',
      hasPassword: !!s.password,
      createdAt: s.createdAt?.toISOString(),
    }));
    return { success: true, data, total };
  }

  async create(name: string, email: string, studentId: string) {
    const existing = await this.userModel.findOne({
      $or: [{ email }, { fabricEnrollmentId: studentId }],
    });
    if (existing) throw new BadRequestException('Email hoặc MSSV đã tồn tại!');

    // Sinh mật khẩu tạm ngẫu nhiên (giống hệt pattern trong importFromExcel) —
    // schema User yêu cầu password không được rỗng, và sinh viên sẽ tự đặt lại
    // mật khẩu thật qua /auth/register lúc kích hoạt tài khoản.
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await this.userModel.create({
      name,
      email,
      fabricEnrollmentId: studentId,
      mssv: studentId,
      role: 'student',
      password: hashedPassword,
      mustChangePassword: true,
    });
    return { success: true };
  }

  /**
   * Sanitize tên file trước khi dùng (kể cả trong log/thông báo lỗi).
   * Chặn path traversal (../), ký tự cấm trên Windows/Linux, giới hạn độ dài.
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\.\./g, '')
      .slice(0, 255);
  }

  async importFromExcel(fileNameRaw: string, fileData: string) {
    const fileName = this.sanitizeFileName(fileNameRaw || '');

    // 1. Validate tên file
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Chỉ chấp nhận file .xlsx hoặc .xls, nhận được: ${ext}`,
      );
    }

    // 2. Validate kích thước (base64 ~ 4/3 kích thước gốc)
    const estimatedSize = Math.ceil(fileData.length * 0.75);
    if (estimatedSize > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File vượt quá 5MB (ước tính ${(estimatedSize / 1024 / 1024).toFixed(1)}MB)`,
      );
    }

    // 3. Decode
    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileData, 'base64');
    } catch {
      throw new BadRequestException('Dữ liệu file không hợp lệ');
    }

    // 4. Validate nội dung thật của file — không tin đuôi file người dùng đặt
    // .xlsx (OOXML/zip): dùng file-type dò chính xác theo magic bytes đầy đủ
    // .xls (OLE Compound File cũ): file-type không phân biệt được với .doc/.ppt
    //   (cùng là CFB container) nên giữ check 2 byte đầu (D0CF) làm fallback,
    //   và tin tưởng bước parse XLSX.read() ở dưới sẽ chặn nếu nội dung không
    //   phải bảng tính hợp lệ.
    const detected = await FileType.fromBuffer(buffer);
    const isXlsLegacyMagic = buffer[0] === 0xd0 && buffer[1] === 0xcf;

    if (ext === '.xlsx' && detected?.mime !== XLSX_MIME) {
      throw new BadRequestException(
        'File .xlsx nhưng nội dung không phải Excel OOXML thật — nghi ngờ file giả mạo đuôi',
      );
    }
    if (ext === '.xls' && !isXlsLegacyMagic) {
      throw new BadRequestException(
        'File .xls nhưng nội dung không đúng định dạng OLE Excel',
      );
    }

    // 5. Parse Excel
    let rows: any[];
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    } catch {
      throw new BadRequestException(
        'Không thể đọc file Excel — file có thể bị hỏng',
      );
    }

    if (rows.length === 0) throw new BadRequestException('File Excel trống!');
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `Tối đa ${MAX_ROWS} dòng mỗi lần import, file có ${rows.length} dòng`,
      );
    }

    // 6. Import từng dòng
    let created = 0,
      skipped = 0,
      emailFailed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const mssv = String(
          row['MSSV'] || row['mssv'] || row['Mã sinh viên'] || '',
        ).trim();
        const name = String(
          row['Họ và tên'] || row['HoTen'] || row['name'] || '',
        ).trim();
        const email = String(row['Email'] || row['email'] || '').trim();

        if (!mssv || !name || !email) {
          skipped++;
          continue;
        }

        const existing = await this.userModel.findOne({
          $or: [{ email }, { fabricEnrollmentId: mssv }],
        });
        if (existing) {
          skipped++;
          continue;
        }

        const tempPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        await this.userModel.create({
          email,
          name,
          mssv,
          fabricEnrollmentId: mssv,
          role: 'student',
          password: hashedPassword,
          mustChangePassword: true,
        });

        try {
          await this.notify.sendCertIssued(email, {
            studentName: name,
            mssv,
            major: '',
            grade: '',
            issueDate: '',
            soHieu: '',
            verifyUrl: `http://localhost:3000/login?type=student`,
          });
        } catch {
          emailFailed++;
        }

        created++;
      } catch (e: any) {
        errors.push(e.message);
        skipped++;
      }
    }

    return {
      success: true,
      created,
      skipped,
      emailFailed,
      total: rows.length,
      errors: errors.slice(0, 10),
    };
  }
}
