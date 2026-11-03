import { IsNotEmpty, IsString } from 'class-validator';
import { IsSafePassword } from '../../auth/password-policy';

export class ChangePasswordDto {
  @IsNotEmpty({ message: 'Mật khẩu cũ không được để trống' })
  @IsString({ message: 'Mật khẩu cũ phải là chuỗi ký tự' })
  oldPassword: string;

  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @IsSafePassword()
  newPassword: string;
}
