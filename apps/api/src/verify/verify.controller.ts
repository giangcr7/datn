import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { VerifyService } from './verify.service';

@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post()
  @Throttle({ medium: { ttl: 60000, limit: 30 } }) // 30 lần/phút cho tra cứu công khai
  verify(@Body() body: any) {
    return this.verifyService.verify(body);
  }
}
