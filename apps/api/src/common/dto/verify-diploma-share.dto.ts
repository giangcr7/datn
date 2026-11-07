import { IsString, Length } from 'class-validator';

export class VerifyDiplomaShareDto {
  @IsString({ message: 'Mã chia sẻ không hợp lệ' })
  @Length(32, 128, { message: 'Mã chia sẻ không hợp lệ' })
  token: string;
}
