import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const PUBLIC_SEARCH_MAX_LENGTH = 80;

export class PublicSearchQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(PUBLIC_SEARCH_MAX_LENGTH)
  q!: string;
}
