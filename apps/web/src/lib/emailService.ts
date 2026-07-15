import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email thông báo cấp văn bằng thành công
export async function sendCertIssuedEmail(params: {
  to: string;
  studentName: string;
  mssv: string;
  major: string;
  grade: string;
  issueDate: string;
  soHieu: string;
  verifyUrl: string;
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: params.to,
    subject: "🎓 Văn bằng tốt nghiệp của bạn đã được cấp phát - ĐH Thủy Lợi",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0056b3; padding: 24px; text-align: center;">
          <h2 style="color: white; margin: 0;">TRƯỜNG ĐẠI HỌC THỦY LỢI</h2>
          <p style="color: #cce0ff; margin: 6px 0 0;">Hệ thống Văn bằng Số Blockchain</p>
        </div>

        <div style="padding: 32px; background: #f9f9f9;">
          <p style="font-size: 16px;">Xin chào <strong>${params.studentName}</strong>,</p>
          <p>Chúc mừng bạn! Văn bằng tốt nghiệp của bạn đã được cấp phát và ghi nhận trên hệ thống Blockchain.</p>

          <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #0056b3; margin-top: 0;">Thông tin văn bằng</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; width: 140px;">Họ và tên:</td><td style="font-weight: bold;">${params.studentName}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">MSSV:</td><td style="font-weight: bold;">${params.mssv}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Ngành học:</td><td>${params.major}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Xếp loại:</td><td style="color: #0056b3; font-weight: bold;">${params.grade}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Ngày cấp:</td><td>${params.issueDate}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Số hiệu:</td><td>${params.soHieu}</td></tr>
            </table>
          </div>

          <div style="background: #e8f4e8; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 12px; color: #2d6a2d; font-weight: bold;">✅ Đã xác thực trên Blockchain</p>
            <a href="${params.verifyUrl}"
               style="display: inline-block; background: #0056b3; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Xác thực văn bằng ngay
            </a>
          </div>

          <p style="color: #666; font-size: 13px;">
            Bạn có thể đăng nhập vào hệ thống để tải PDF văn bằng và chia sẻ minh chứng với nhà tuyển dụng.
          </p>
        </div>

        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px; background: #f0f0f0;">
          © ${new Date().getFullYear()} Trường Đại học Thủy Lợi - Phân hiệu TP.HCM
        </div>
      </div>
    `,
  });
}

// Email chào mừng khi tạo tài khoản (dùng lại từ import)
export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  mssv: string;
  tempPassword: string;
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: params.to,
    subject: "Tài khoản Hệ thống Văn bằng Số - ĐH Thủy Lợi",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0056b3; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">TRƯỜNG ĐẠI HỌC THỦY LỢI</h2>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Xin chào <strong>${params.name}</strong>,</p>
          <p>Tài khoản của bạn đã được tạo trên hệ thống xác thực văn bằng số.</p>
          <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p><strong>MSSV:</strong> ${params.mssv}</p>
            <p><strong>Email:</strong> ${params.to}</p>
            <p><strong>Mật khẩu tạm:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-size: 16px;">${params.tempPassword}</code></p>
          </div>
          <p style="color: #e74c3c;"><strong>⚠️ Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu.</strong></p>
          <a href="${process.env.NEXTAUTH_URL}/login?type=student"
             style="display: inline-block; background: #0056b3; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
            Đăng nhập ngay
          </a>
        </div>
      </div>
    `,
  });
}
