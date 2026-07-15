import { IsNotEmpty, IsString } from 'class-validator';

export class RejectCertDto {
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  @IsString()
  reason: string;
}
