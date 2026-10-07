import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class SendOtpDto {
  @IsNotEmpty({ message: 'MSSV không được để trống' })
  @IsString({ message: 'MSSV phải là chuỗi ký tự' })
  mssv: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;
}
