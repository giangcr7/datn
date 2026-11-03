import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const REQUEST_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'NEEDS_INFORMATION',
  'RESOLVED',
  'REJECTED',
  'CANCELLED',
] as const;
export const CHANGE_FIELDS = ['fullName', 'dob', 'major', 'grade'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export class RequestedChangeDto {
  @IsIn(CHANGE_FIELDS) field!: ChangeField;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().normalize('NFC') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  value!: string;
}
export class CreateChangeRequestDto {
  @IsUUID() diplomaId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique((item: RequestedChangeDto | null) => item?.field)
  @ValidateNested({ each: true })
  @Type(() => RequestedChangeDto)
  changes!: RequestedChangeDto[];
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}
export class ChangeRequestQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsIn(REQUEST_STATUSES) status?: RequestStatus;
}
export class ChangeRequestActionDto {
  @IsIn([
    'IN_REVIEW',
    'NEEDS_INFORMATION',
    'RESOLVED',
    'REJECTED',
    'CANCELLED',
    'PENDING',
  ])
  status!: RequestStatus;
  @IsInt() @Min(1) expectedRevision!: number;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  note!: string;
  @IsOptional() @IsUUID() resolvedDiplomaId?: string;
}
