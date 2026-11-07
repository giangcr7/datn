import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotifyModule } from '../notify/notify.module';
import { VerifyModule } from '../verify/verify.module';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

@Module({
  imports: [AuditModule, NotifyModule, VerifyModule],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
