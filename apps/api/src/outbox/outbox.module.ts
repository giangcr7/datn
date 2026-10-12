import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { FabricModule } from '../fabric/fabric.module';

@Module({
  imports: [FabricModule],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
