import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Header,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { VerifyService } from './verify.service';
import { publicVerification } from './public-verification';

@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('pdf')
  @Header('Cache-Control', 'no-store')
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async verifyPdf(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Vui lòng chọn PDF cần xác thực');
    return publicVerification(await this.verifyService.verifyPdf(file.buffer));
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @Throttle({ medium: { ttl: 60000, limit: 30 } }) // 30 lần/phút cho tra cứu công khai
  async verify(@Body() body: any) {
    return publicVerification(await this.verifyService.verify(body));
  }
}
