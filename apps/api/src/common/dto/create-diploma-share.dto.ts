import { IsEmail, IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateDiplomaShareDto {
  @IsUUID('4', { message: 'Mã văn bằng không hợp lệ' })
  diplomaId: string;

  @IsEmail({}, { message: 'Email người nhận không hợp lệ' })
  recipientEmail: string;

  @IsInt({ message: 'Thời hạn chia sẻ không hợp lệ' })
  @Min(1)
  @Max(168)
  expiresInHours = 72;
}
