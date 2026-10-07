import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from '../common/dto/login.dto';
import { ChangePasswordDto } from '../common/dto/change-password.dto';
import { RefreshTokenDto } from '../common/dto/refresh-token.dto';
import { RegisterDto } from '../common/dto/register.dto';
import { SendOtpDto } from '../common/dto/send-otp.dto';
import { JwtAuthGuard } from './jwt.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  login(@Body() body: LoginDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.authService.login(
      body.email,
      body.password,
      body.role,
      ip,
      userAgent,
    );
  }

  @Post('refresh')
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshAccessToken(
      body.refreshToken,
      ip,
      userAgent,
    );
  }

  @Post('logout')
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logoutAll(@Req() req: any) {
    return this.authService.logoutAllDevices(req.user.id);
  }

  @Post('change-password/:id')
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  changePassword(
    @Param('id') id: string,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.authService.changePassword(
      id,
      body.oldPassword,
      body.newPassword,
      ip,
    );
  }

  @Post('send-otp')
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  sendOtp(@Body() body: SendOtpDto) {
    return this.authService.sendOtp(body.mssv, body.email);
  }

  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  register(@Body() body: RegisterDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.authService.registerStudent(
      body.mssv,
      body.email,
      body.password,
      body.otp,
      ip,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listUsers() {
    return this.authService.findAllUsers();
  }
}
