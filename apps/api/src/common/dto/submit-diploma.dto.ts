import { IsDateString, IsNotEmpty } from 'class-validator';
export class SubmitDiplomaDto {
  @IsDateString() @IsNotEmpty() issuedOn!: string;
}
