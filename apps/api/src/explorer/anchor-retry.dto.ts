import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AnchorRetryDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;

  @Matches(/^[a-f0-9]{64}$/)
  expectedRetryToken!: string;
}
