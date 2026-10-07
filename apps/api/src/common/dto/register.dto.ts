import { IsNotEmpty, IsString, IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'MSSV không được để trống' })
  @IsString({ message: 'MSSV phải là chuỗi ký tự' })
  mssv: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @IsNotEmpty({ message: 'Mã xác thực OTP không được để trống' })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  otp: string;

  @IsNotEmpty({ message: 'Vai trò không được để trống' })
  @IsString({ message: 'Vai trò phải là chuỗi ký tự' })
  role: string;
}
