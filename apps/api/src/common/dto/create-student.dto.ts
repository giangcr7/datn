import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class CreateStudentDto {
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  name: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsNotEmpty({ message: 'Mã sinh viên không được để trống' })
  @IsString({ message: 'Mã sinh viên phải là chuỗi ký tự' })
  studentId: string;
}
