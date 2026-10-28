import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DegreeType } from '../generated/prisma/client';

export class CorrectionQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsIn(['REJECTED', 'DRAFT']) stage: 'REJECTED' | 'DRAFT' = 'REJECTED';
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;
}

export class CorrectionActionDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
  @IsDateString({ strict: true }) expectedUpdatedAt!: string;
}

export class CorrectionEditDto extends CorrectionActionDto {
  @IsString() @IsNotEmpty() @MaxLength(255) fullName!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dob!: string;
  @IsUUID() programId!: string;
  @Type(() => Number) @IsInt() @Min(1900) @Max(2200) namTotNghiep!: number;
  @IsString() @IsNotEmpty() grade!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10) gpa?: number | null;
  @IsEnum(DegreeType) degreeType!: DegreeType;
  @IsOptional() @IsString() @MaxLength(100) className?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(120) soHieu!: string;
  @IsString() @IsNotEmpty() @MaxLength(180) soVaoSo!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  issueDate!: string;
  @IsOptional() @IsString() @MaxLength(255) fullNameLatin?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(255) majorNameEn!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) issuePlace!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) diplomaSignerName!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) diplomaSignerTitle!: string;
}
