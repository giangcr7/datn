import { IsNotEmpty, IsNumber, IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class RequestCertDto {
  @IsNotEmpty({ message: 'MSSV không được để trống' })
  @IsString()
  mssv: string;

  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString()
  fullName: string;

  @IsNotEmpty({ message: 'Ngành học không được để trống' })
  @IsString()
  major: string;

  @IsNotEmpty({ message: 'Xếp loại không được để trống' })
  @IsString()
  grade: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'GPA phải là số' })
  gpa: number;

  @IsOptional() @IsString() soHieu: string;
  @IsOptional() @IsString() soVaoSo: string;
  @IsOptional() @IsString() className: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  namTotNghiep: number;

  @IsNotEmpty({ message: 'Cơ sở không được để trống' })
  @IsIn(['ORG1', 'ORG2'], { message: 'Cơ sở phải là ORG1 hoặc ORG2' })
  org: string;
}
