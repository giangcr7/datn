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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DegreeType } from '../generated/prisma/client';
import { CLASSIFICATION_LABELS, normalizeText } from '../database/data-utils';

const cleanText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeText(value) : value;
const optionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeText(value) || undefined : value;

export class LookupDiplomaDto {
  @Transform(cleanText)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  @Transform(cleanText)
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dob!: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._/-]{1,39}$/i)
  mssv?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  soHieu?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  soVaoSo?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  className?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  major?: string;

  @IsOptional()
  @IsEnum(DegreeType)
  degreeType?: DegreeType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  namTotNghiep?: number;

  @IsOptional()
  @IsIn(Object.values(CLASSIFICATION_LABELS))
  grade?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  gpa?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  issueDate?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisionNo?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  decisionDate?: string;
}
