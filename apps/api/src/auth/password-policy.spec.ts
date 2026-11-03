import { validate } from 'class-validator';
import { ChangePasswordDto } from '../common/dto/change-password.dto';
import { RegisterDto } from '../common/dto/register.dto';
import { assertNewPassword, passwordPolicyError } from './password-policy';

describe('new password policy', () => {
  it.each([
    undefined,
    null,
    123456,
    '',
    '123456',
    'admin@123',
    '123456789012345',
    'passwordpassword',
    'PasswordPassword',
    'abcdefghijklmno'.repeat(5),
    'abc'.repeat(8),
    ' '.repeat(15),
  ])('rejects a weak, invalid or oversized value: %p', (value) => {
    expect(passwordPolicyError(value)).toEqual(expect.any(String));
    expect(() => assertNewPassword(value)).toThrow();
  });

  it.each([
    'A long unique phrase 2026!',
    'Mot cum tu rieng cua toi!',
    'Mật khẩu riêng của cán bộ',
    '0123456789ABCDEF'.repeat(4),
  ])(
    'accepts a long non-repeating password without mandatory character classes',
    (value) => {
      expect(passwordPolicyError(value)).toBeUndefined();
    },
  );

  it('rejects more than 72 UTF-8 bytes before bcrypt can truncate them', () => {
    expect(passwordPolicyError('Một mật khẩu nhiều dấu '.repeat(4))).toContain(
      '72',
    );
  });

  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(passwordPolicyError('😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌')).toContain('15');
  });

  it('enforces the policy through the password change DTO', async () => {
    const weak = Object.assign(new ChangePasswordDto(), {
      oldPassword: 'old',
      newPassword: '123456',
    });
    expect(
      (await validate(weak)).some((error) => error.property === 'newPassword'),
    ).toBe(true);
    weak.newPassword = 'A unique password phrase!';
    expect(await validate(weak)).toEqual([]);
  });

  it('enforces the same policy through student activation', async () => {
    const dto = Object.assign(new RegisterDto(), {
      mssv: 'FIXTURE',
      email: 'fixture@example.invalid',
      otp: '123456',
      role: 'student',
      password: '123456',
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'password'),
    ).toBe(true);
    dto.password = 'A separate student phrase!';
    expect(await validate(dto)).toEqual([]);
  });
});
