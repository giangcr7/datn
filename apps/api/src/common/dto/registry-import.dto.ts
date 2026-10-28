import {
  IsBase64,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
export class RegistryImportDto {
  @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @IsBase64() @IsNotEmpty() @MaxLength(7 * 1024 * 1024) fileData!: string;
}
export class CommitRegistryDto {
  @IsIn(['DIGITIZATION', 'ISSUANCE'])
  originType: 'DIGITIZATION' | 'ISSUANCE' = 'ISSUANCE';
}
export class ReviewRegistryRowDto {
  @IsObject() corrections!: Record<string, unknown>;
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}
export class ProgramAliasDto {
  @IsUUID() programId!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) originalName!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}
