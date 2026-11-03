import { Module } from '@nestjs/common';
import { ChangeRequestController } from './change-request.controller';
import { ChangeRequestService } from './change-request.service';

@Module({
  controllers: [ChangeRequestController],
  providers: [ChangeRequestService],
})
export class ChangeRequestModule {}
