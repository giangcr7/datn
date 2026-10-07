import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument } from '../mongo/schemas/user.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../mongo/schemas/refresh-token.schema';
import { AuditService, AuditAction } from '../audit/audit.service';

import { Otp, OtpDocument } from '../mongo/schemas/otp.schema';
import { NotifyService } from '../notify/notify.service';

const REFRESH_TOKEN_TTL_DAYS = 7;
const REFRESH_TOKEN_BYTES = 40; // entropy cao — token dạng random, không phải JWT

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    private jwtService: JwtService,
    private auditService: AuditService,
    private notifyService: NotifyService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueRefreshToken(
    userId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<string> {
    const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokenModel.create({
      userId,
      tokenHash: this.hashToken(token),
      expiresAt,
      isRevoked: false,
      ip,
      userAgent,
    });

    return token; // trả plaintext cho client — chỉ lần này thôi, DB chỉ giữ hash
  }

  async login(
    email: string,
    password: string,
    role: string,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.userModel.findOne({ email }).lean();

    if (!user) {
      await this.auditService.log({
        userId: 'unknown',
        userEmail: email,
        action: AuditAction.LOGIN,
        result: 'FAILED',
        errorMessage: 'Tài khoản không tồn tại',
        ip,
      });
      throw new UnauthorizedException('Tài khoản không tồn tại!');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await this.auditService.log({
        userId: user._id.toString(),
        userEmail: email,
        action: AuditAction.LOGIN,
        result: 'FAILED',
        errorMessage: 'Mật khẩu không chính xác',
        ip,
      });
      throw new UnauthorizedException('Mật khẩu không chính xác!');
    }

    if (user.role.toUpperCase() !== role.toUpperCase()) {
      await this.auditService.log({
        userId: user._id.toString(),
        userEmail: email,
        action: AuditAction.LOGIN,
        result: 'FAILED',
        errorMessage: 'Sai cổng đăng nhập',
        ip,
      });
      throw new UnauthorizedException('Sai cổng đăng nhập!');
    }

    const payload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      mssv: user.mssv || user.fabricEnrollmentId,
      mustChangePassword: user.mustChangePassword || false,
    };

    await this.auditService.log({
      userId: user._id.toString(),
      userEmail: email,
      action: AuditAction.LOGIN,
      result: 'SUCCESS',
      ip,
    });

    const refreshToken = await this.issueRefreshToken(
      user._id.toString(),
      ip,
      userAgent,
    );

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refreshToken,
      user: payload,
    };
  }

  /**
   * Cấp access token mới từ refresh token hợp lệ.
   * Áp dụng rotation: token cũ bị thu hồi ngay, cấp token mới thay thế.
   * Nếu phát hiện dùng lại token đã bị thu hồi (reuse) → nghi ngờ bị đánh cắp,
   * thu hồi TOÀN BỘ refresh token của user để buộc đăng nhập lại mọi nơi.
   */
  async refreshAccessToken(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash });

    if (!stored) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    if (stored.isRevoked) {
      // Reuse detection: token này đã bị thu hồi (đã dùng rotation trước đó)
      // mà vẫn có người dùng lại → khả năng bị đánh cắp.
      await this.refreshTokenModel.updateMany(
        { userId: stored.userId, isRevoked: false },
        { isRevoked: true },
      );
      await this.auditService.log({
        userId: stored.userId,
        userEmail: '',
        action: AuditAction.LOGIN,
        result: 'FAILED',
        errorMessage:
          'Phát hiện refresh token reuse — đã thu hồi toàn bộ session',
        ip,
      });
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại',
      );
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Refresh token đã hết hạn, vui lòng đăng nhập lại',
      );
    }

    const user = await this.userModel.findById(stored.userId).lean();
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }

    // Rotation: thu hồi token cũ, cấp token mới
    const newRefreshToken = await this.issueRefreshToken(
      stored.userId,
      ip,
      userAgent,
    );
    stored.isRevoked = true;
    stored.replacedByTokenHash = this.hashToken(newRefreshToken);
    await stored.save();

    const payload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      mssv: user.mssv || user.fabricEnrollmentId,
      mustChangePassword: user.mustChangePassword || false,
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: newRefreshToken,
    };
  }

  /**
   * Logout — thu hồi 1 refresh token cụ thể (đăng xuất thiết bị hiện tại).
   */
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenModel.updateOne({ tokenHash }, { isRevoked: true });
    return { success: true, message: 'Đăng xuất thành công' };
  }

  /**
   * Đăng xuất khỏi TẤT CẢ thiết bị — thu hồi toàn bộ refresh token của user.
   * Hữu ích khi user đổi mật khẩu, hoặc nghi ngờ tài khoản bị chiếm.
   */
  async logoutAllDevices(userId: string) {
    await this.refreshTokenModel.updateMany(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    return { success: true, message: 'Đã đăng xuất khỏi tất cả thiết bị' };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    ip?: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException('Không tìm thấy người dùng');

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      await this.auditService.log({
        userId,
        userEmail: user.email,
        action: AuditAction.CHANGE_PASSWORD,
        result: 'FAILED',
        errorMessage: 'Mật khẩu cũ không đúng',
        ip,
      });
      throw new UnauthorizedException('Mật khẩu cũ không đúng');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    // Đổi mật khẩu xong → thu hồi toàn bộ session cũ, bắt đăng nhập lại
    // bằng mật khẩu mới trên mọi thiết bị (chuẩn bảo mật).
    await this.logoutAllDevices(userId);

    await this.auditService.log({
      userId,
      userEmail: user.email,
      action: AuditAction.CHANGE_PASSWORD,
      result: 'SUCCESS',
      ip,
    });

    return { success: true, message: 'Đổi mật khẩu thành công' };
  }

  async sendOtp(mssv: string, email: string) {
    const student = await this.userModel.findOne({
      $or: [{ mssv }, { fabricEnrollmentId: mssv }],
      email,
      role: { $regex: new RegExp('^student$', 'i') },
    });

    if (!student) {
      throw new UnauthorizedException(
        'MSSV hoặc Email không tồn tại trong danh sách sinh viên trường!',
      );
    }

    // Sinh mã ngẫu nhiên 6 số bảo mật
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

    // Xóa OTP cũ nếu có
    await this.otpModel.deleteMany({ email, mssv });

    // Lưu OTP mới
    await this.otpModel.create({
      email,
      mssv,
      otp,
      expiresAt,
    });

    // In ra console log để dev / kiểm thử dễ dàng
    console.log(
      `[AUTH-OTP] Mã kích hoạt cho SV ${student.name} (${mssv} - ${email}): >>> ${otp} <<< (Hạn 5 phút)`,
    );

    // Gửi email
    await this.notifyService.sendActivationOtp(email, student.name, otp);

    return {
      success: true,
      message: `Mã OTP đã được gửi tới email ${email}. Vui lòng kiểm tra hộp thư!`,
    };
  }

  async registerStudent(
    mssv: string,
    email: string,
    password: string,
    otp: string,
    ip?: string,
  ) {
    const existing = await this.userModel.findOne({
      $or: [{ mssv }, { fabricEnrollmentId: mssv }],
      email,
      role: { $regex: new RegExp('^student$', 'i') },
    });

    if (!existing)
      throw new UnauthorizedException(
        'MSSV hoặc Email không tồn tại trong hệ thống!',
      );

    // Xác thực mã OTP
    const validOtp = await this.otpModel.findOne({
      email,
      mssv,
      otp: otp.trim(),
      expiresAt: { $gt: new Date() },
    });

    if (!validOtp) {
      await this.auditService.log({
        userId: existing._id.toString(),
        userEmail: email,
        action: AuditAction.REGISTER,
        result: 'FAILED',
        errorMessage: 'Mã OTP không chính xác hoặc đã hết hạn',
        target: mssv,
        ip,
      });
      throw new UnauthorizedException(
        'Mã OTP không chính xác hoặc đã hết hạn!',
      );
    }

    // Xóa mã OTP sau khi dùng thành công (ngăn chặn replay attack)
    await this.otpModel.deleteMany({ email, mssv });

    const hashed = await bcrypt.hash(password, 10);
    existing.password = hashed;
    existing.mustChangePassword = false;
    await existing.save();

    await this.auditService.log({
      userId: existing._id.toString(),
      userEmail: email,
      action: AuditAction.REGISTER,
      result: 'SUCCESS',
      target: mssv,
      ip,
    });

    return {
      success: true,
      message: 'Kích hoạt tài khoản thành công! Vui lòng đăng nhập.',
    };
  }

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .lean();
    if (!user) throw new UnauthorizedException('Không tìm thấy người dùng');
    return user;
  }

  async findAllUsers() {
    const users = await this.userModel.find({}).sort({ createdAt: -1 }).lean();
    return users;
  }
}
