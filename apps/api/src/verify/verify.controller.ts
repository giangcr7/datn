import { BadRequestException, Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { VerifyService } from './verify.service';

@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('pdf')
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  verifyPdf(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Vui lòng chọn PDF cần xác thực');
    return this.verifyService.verifyPdf(file.buffer);
  }

  @Post()
  @Throttle({ medium: { ttl: 60000, limit: 30 } }) // 30 lần/phút cho tra cứu công khai
  verify(@Body() body: any) {
    return this.verifyService.verify(body);
  }
}
