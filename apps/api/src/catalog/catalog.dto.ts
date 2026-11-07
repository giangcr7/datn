import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DegreeType } from '../generated/prisma/client';

export class SaveProgramDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nameEn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}

export class SaveDiplomaTypeDto {
  @IsEnum(DegreeType)
  code!: DegreeType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}
