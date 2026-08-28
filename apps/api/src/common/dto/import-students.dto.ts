import { IsNotEmpty, IsString } from 'class-validator';

export class ImportStudentsDto {
  @IsNotEmpty({ message: 'Tên file không được để trống' })
  @IsString({ message: 'Tên file phải là chuỗi ký tự' })
  fileName: string;

  @IsNotEmpty({ message: 'Dữ liệu file không được để trống' })
  @IsString({ message: 'Dữ liệu file phải là chuỗi ký tự (base64)' })
  fileData: string;
}