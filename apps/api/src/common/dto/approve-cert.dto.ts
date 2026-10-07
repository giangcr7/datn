import { IsOptional, IsString } from 'class-validator';

export class ApproveCertDto {
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  note: string;
}
