import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
