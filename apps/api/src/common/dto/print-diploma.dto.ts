import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DegreeType } from '../../generated/prisma/client';
import { BulkDiplomaDto } from './bulk-diploma.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PrintDiplomaDataDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate?: string;
  @IsOptional() @IsEnum(DegreeType) degreeType?: DegreeType | null;
  @IsOptional() @IsString() @MaxLength(255) fullNameLatin?: string | null;
  @IsOptional() @IsString() @MaxLength(255) majorNameEn?: string | null;
  @IsOptional() @IsString() @MaxLength(120) issuePlace?: string | null;
  @IsOptional() @IsString() @MaxLength(255) diplomaSignerName?: string | null;
  @IsOptional() @IsString() @MaxLength(120) diplomaSignerTitle?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}

export class BulkPrintDiplomaDto extends BulkDiplomaDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PrintDiplomaDataDto)
  printData!: PrintDiplomaDataDto;
}
