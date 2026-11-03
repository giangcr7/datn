import { BadRequestException } from '@nestjs/common';
import { ValidateBy } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_BYTES = 72;

const commonPasswords = new Set([
  '123456789012345',
  '1234567890123456',
  '12345678901234567890',
  'passwordpassword',
  'password123456789',
  'qwertyuiopasdfgh',
  'adminadminadmin',
  'letmeinletmeinletmein',
  'nhatruong@123456',
  'university@123456',
]);

export function passwordPolicyError(value: unknown): string | undefined {
  if (typeof value !== 'string' || [...value].length < PASSWORD_MIN_LENGTH)
    return 'Mật khẩu mới phải có ít nhất 15 ký tự';
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES)
    return 'Mật khẩu mới không được vượt quá 72 byte UTF-8';
  const normalized = value.normalize('NFKC').toLowerCase();
  if (commonPasswords.has(normalized) || /^(.{1,5})\1+$/u.test(normalized))
    return 'Mật khẩu quá phổ biến hoặc lặp lại; hãy chọn một cụm từ khó đoán';
  return undefined;
}

export function assertNewPassword(value: unknown): void {
  const error = passwordPolicyError(value);
  if (error) throw new BadRequestException(error);
}

export const IsSafePassword = () =>
  ValidateBy({
    name: 'isSafePassword',
    validator: {
      validate: (value: unknown) => !passwordPolicyError(value),
      defaultMessage: (arguments_) =>
        passwordPolicyError(arguments_?.value) || '',
    },
  });
