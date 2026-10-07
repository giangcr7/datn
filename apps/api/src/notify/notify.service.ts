import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  async sendCertIssued(
    to: string,
    data: {
      studentName: string;
      mssv: string;
      major: string;
      grade: string;
      issueDate: string;
      soHieu: string;
      verifyUrl: string;
    },
  ) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject: 'Thông báo cấp phát văn bằng - ĐH Thủy Lợi',
        html: `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#0056b3;padding:24px;text-align:center">
              <h2 style="color:white;margin:0">TRƯỜNG ĐẠI HỌC THỦY LỢI</h2>
            </div>
            <div style="padding:32px;background:#f9f9f9">
              <p>Xin chào <strong>${data.studentName}</strong>,</p>
              <p>Văn bằng tốt nghiệp của bạn đã được cấp phát thành công.</p>
              <div style="background:white;border-radius:8px;padding:20px;margin:20px 0">
                <p><strong>MSSV:</strong> ${data.mssv}</p>
                <p><strong>Ngành:</strong> ${data.major}</p>
                <p><strong>Xếp loại:</strong> ${data.grade}</p>
                <p><strong>Ngày cấp:</strong> ${data.issueDate}</p>
                <p><strong>Số hiệu:</strong> ${data.soHieu}</p>
              </div>
              <a href="${data.verifyUrl}" style="background:#0056b3;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">
                Xác thực văn bằng
              </a>
            </div>
          </div>
        `,
      });
      this.logger.log(`Email cấp bằng gửi thành công tới ${to}`);
    } catch (error: any) {
      this.logger.warn(`Gửi email thất bại: ${error.message}`);
    }
  }

  async sendCertRevoked(
    to: string,
    data: {
      studentName: string;
      mssv: string;
      fullName: string;
      major: string;
      reason: string;
    },
  ) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject: 'Thông báo thu hồi văn bằng - ĐH Thủy Lợi',
        html: `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#cc0000;padding:24px;text-align:center">
              <h2 style="color:white;margin:0">TRƯỜNG ĐẠI HỌC THỦY LỢI</h2>
            </div>
            <div style="padding:32px;background:#f9f9f9">
              <p>Xin chào <strong>${data.studentName}</strong>,</p>
              <p style="color:#cc0000;font-weight:bold">Văn bằng của bạn đã bị thu hồi.</p>
              <div style="background:white;border-radius:8px;padding:20px;margin:20px 0">
                <p><strong>MSSV:</strong> ${data.mssv}</p>
                <p><strong>Họ tên:</strong> ${data.fullName}</p>
                <p><strong>Ngành:</strong> ${data.major}</p>
                <p><strong>Lý do:</strong> <span style="color:#cc0000">${data.reason}</span></p>
                <p><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN')}</p>
              </div>
            </div>
          </div>
        `,
      });
      this.logger.log(`Email thu hồi gửi thành công tới ${to}`);
    } catch (error: any) {
      this.logger.warn(`Gửi email thu hồi thất bại: ${error.message}`);
    }
  }

  async sendIntegrityAlert(alerts: any[]) {
    try {
      const rows = alerts
        .map(
          (a) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd">${a.uuid}</td>
          <td style="padding:8px;border:1px solid #ddd">${a.mssv}</td>
          <td style="padding:8px;border:1px solid #ddd">${a.fullName}</td>
          <td style="padding:8px;border:1px solid #ddd;color:#cc0000"><b>${a.type}</b></td>
        </tr>
      `,
        )
        .join('');

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_USER,
        subject: `Cảnh báo toàn vẹn dữ liệu — ${alerts.length} bất thường`,
        html: `
          <div style="font-family:Arial;max-width:700px;margin:0 auto">
            <div style="background:#cc0000;padding:20px;text-align:center">
              <h2 style="color:white;margin:0">CẢNH BÁO TOÀN VẸN DỮ LIỆU</h2>
              <p style="color:#ffcccc">Hệ thống Văn bằng Blockchain — ĐH Thủy Lợi</p>
            </div>
            <div style="padding:24px;background:#f9f9f9">
              <p>Phát hiện <strong>${alerts.length}</strong> bất thường:</p>
              <table style="width:100%;border-collapse:collapse;margin-top:16px">
                <tr style="background:#1F4E79;color:white">
                  <th style="padding:8px;text-align:left">UUID</th>
                  <th style="padding:8px;text-align:left">MSSV</th>
                  <th style="padding:8px;text-align:left">Họ tên</th>
                  <th style="padding:8px;text-align:left">Loại lỗi</th>
                </tr>
                ${rows}
              </table>
              <p style="margin-top:16px;color:#666">
                Thời gian: ${new Date().toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
        `,
      });
      this.logger.log(`Email cảnh báo ${alerts.length} bất thường đã gửi`);
    } catch (error: any) {
      this.logger.warn(`Gửi email cảnh báo thất bại: ${error.message}`);
    }
  }

  async sendActivationOtp(to: string, studentName: string, otp: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject: 'Mã xác thực kích hoạt tài khoản - ĐH Thủy Lợi',
        html: `
          <div style="font-family:Arial, sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
            <div style="background:#0056b3;padding:24px;text-align:center">
              <h2 style="color:white;margin:0;font-size:20px;">TRƯỜNG ĐẠI HỌC THỦY LỢI</h2>
              <p style="color:#d0e2ff;margin:4px 0 0 0;font-size:13px;">Hệ thống Quản lý Văn bằng Blockchain</p>
            </div>
            <div style="padding:32px;background:#ffffff">
              <p style="font-size:15px;color:#333">Xin chào <strong>${studentName || 'Sinh viên'}</strong>,</p>
              <p style="font-size:14px;color:#555;line-height:1.6">
                Bạn đang thực hiện kích hoạt tài khoản sinh viên trên Cổng Văn bằng Blockchain. 
                Vui lòng sử dụng mã OTP dưới đây để hoàn tất quá trình:
              </p>
              <div style="background:#f0f5ff;border:2px dashed #0056b3;border-radius:8px;padding:18px;margin:24px 0;text-align:center">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#0056b3">${otp}</span>
              </div>
              <p style="font-size:13px;color:#888;margin-bottom:0">
                ⏱ Mã xác thực này có hiệu lực trong vòng <strong>5 phút</strong>.<br>
                🔒 Vì lý do an toàn, tuyệt đối không chia sẻ mã này cho bất kỳ ai.
              </p>
            </div>
          </div>
        `,
      });
      this.logger.log(`Email OTP kích hoạt gửi thành công tới ${to}`);
    } catch (error: any) {
      this.logger.warn(`Gửi email OTP thất bại: ${error.message}`);
    }
  }
}
