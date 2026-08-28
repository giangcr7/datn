import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class IssueCertDto {
  @IsNotEmpty({ message: 'MSSV không được để trống' })
  @IsString({ message: 'MSSV phải là chuỗi ký tự' })
  mssv: string;

  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  fullName: string;

  @IsNotEmpty({ message: 'Ngành học không được để trống' })
  @IsString({ message: 'Ngành học phải là chuỗi ký tự' })
  major: string;

  @IsNotEmpty({ message: 'Xếp loại không được để trống' })
  @IsString({ message: 'Xếp loại phải là chuỗi ký tự' })
  grade: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'GPA phải là số' })
  gpa: number;

  @IsOptional() @IsString({ message: 'Số hiệu phải là chuỗi ký tự' }) soHieu: string;
  @IsOptional() @IsString({ message: 'Số vào sổ phải là chuỗi ký tự' }) soVaoSo: string;
  @IsOptional() @IsString({ message: 'Tên lớp phải là chuỗi ký tự' }) className: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Năm tốt nghiệp phải là số' })
  namTotNghiep: number;
}