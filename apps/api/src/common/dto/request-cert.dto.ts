import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RequestCertDto {
  @IsString() @Matches(/^\d{10}$/) mssv!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) fullName!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) major!: string;
  @IsString() @IsNotEmpty() grade!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(4) gpa?:
    | number
    | null;
  @IsString() @IsNotEmpty() @MaxLength(120) soHieu!: string;
  @IsString() @IsNotEmpty() @MaxLength(180) soVaoSo!: string;
  @IsOptional() @IsString() @MaxLength(100) className?: string;
  @Type(() => Number) @IsInt() @Min(1900) namTotNghiep!: number;
  @IsOptional() @IsIn(['ORG1', 'ORG2']) org?: string;
  @IsOptional() @IsDateString() dob?: string;
  @IsDateString() @IsNotEmpty() issueDate!: string;
}
