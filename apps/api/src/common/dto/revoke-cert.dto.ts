import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeCertDto {
  @IsNotEmpty({ message: 'Mã văn bằng (certUUID) không được để trống' })
  @IsString({ message: 'Mã văn bằng (certUUID) phải là chuỗi ký tự' })
  certUUID: string;

  @IsNotEmpty({ message: 'Lý do thu hồi không được để trống' })
  @IsString({ message: 'Lý do thu hồi phải là chuỗi ký tự' })
  reason: string;
}