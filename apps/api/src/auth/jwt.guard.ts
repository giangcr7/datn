import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthActor } from './auth-actor';
import { ALLOW_PASSWORD_CHANGE } from './decorators/allow-password-change.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;
    const actor = context.switchToHttp().getRequest<{ user: AuthActor }>().user;
    if (
      actor.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      throw new ForbiddenException({
        message: 'Vui lòng đổi mật khẩu trước khi sử dụng chức năng này',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    return true;
  }
}
