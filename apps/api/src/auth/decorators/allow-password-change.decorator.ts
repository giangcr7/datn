import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE = 'allow-password-change';
export const AllowPasswordChange = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE, true);
