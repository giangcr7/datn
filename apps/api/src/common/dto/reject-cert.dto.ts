import { IsNotEmpty, IsString } from 'class-validator';

export class RejectCertDto {
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự' })
  reason: string;
}