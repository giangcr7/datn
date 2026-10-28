import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AnchorQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @IsOptional()
  @IsIn(['ISSUE', 'REVOKE'])
  eventType?: 'ISSUE' | 'REVOKE';

  @IsOptional()
  @IsIn(['QUEUED', 'SUBMITTED', 'COMMITTED', 'FAILED', 'EXHAUSTED'])
  status?: 'QUEUED' | 'SUBMITTED' | 'COMMITTED' | 'FAILED' | 'EXHAUSTED';
}
