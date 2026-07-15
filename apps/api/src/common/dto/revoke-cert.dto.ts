import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeCertDto {
  @IsNotEmpty({ message: 'certUUID không được để trống' })
  @IsString()
  certUUID: string;

  @IsNotEmpty({ message: 'Lý do thu hồi không được để trống' })
  @IsString()
  reason: string;
}
