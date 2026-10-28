import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CorrectionActionDto } from './correction.dto';

export class ReplacementQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsIn(['DRAFT', 'REQUESTED', 'REJECTED', 'APPROVED'])
  stage: 'DRAFT' | 'REQUESTED' | 'REJECTED' | 'APPROVED' = 'DRAFT';
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;
}

export class CreateReplacementDto extends CorrectionActionDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) basis!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) soHieu!: string;
  @IsString() @IsNotEmpty() @MaxLength(180) soVaoSo!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  issueDate!: string;
}
