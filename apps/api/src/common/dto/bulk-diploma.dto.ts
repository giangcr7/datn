import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BulkDiplomaDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  diplomaIds!: string[];
}

export class BulkRejectDiplomaDto extends BulkDiplomaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
