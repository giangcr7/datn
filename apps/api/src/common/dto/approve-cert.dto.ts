import { IsOptional, IsString } from 'class-validator';

export class ApproveCertDto {
  @IsOptional()
  @IsString()
  note: string;
}
