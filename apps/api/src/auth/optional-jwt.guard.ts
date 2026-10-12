import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt.guard';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  canActivate(context: ExecutionContext) {
    const authorization = context.switchToHttp().getRequest()
      .headers.authorization;
    return authorization ? super.canActivate(context) : true;
  }
}
