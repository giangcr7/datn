import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class IssuanceBatchQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(255) @Transform(trim) search?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  issuanceYear?: number;
  @IsOptional()
  @IsIn([
    'DRAFT',
    'PENDING',
    'REJECTED',
    'ANCHOR_PENDING',
    'ANCHOR_FAILED',
    'ON_CHAIN',
    'REVOKED',
    'REPLACED',
    'READY',
    'NEEDS_REVIEW',
  ])
  status?: string;
}

export class IssuanceBatchOptionsDto {
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) search?: string;
}

export class CreateIssuanceBatchDto {
  @Type(() => Number) @IsInt() @Min(1900) @Max(2200) issuanceYear!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(999) batchNumber!: number;
}
export class IssuanceBatchMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  diplomaIds!: string[];
}

export class IssuanceBatchPublishEntryDto {
  @IsUUID() uuid!: string;
  @IsDateString({ strict: true }) expectedUpdatedAt!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedReviewToken!: string;
}

export class PublishIssuanceBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((entry: IssuanceBatchPublishEntryDto) => entry?.uuid)
  @ValidateNested({ each: true })
  @Type(() => IssuanceBatchPublishEntryDto)
  entries!: IssuanceBatchPublishEntryDto[];
}
