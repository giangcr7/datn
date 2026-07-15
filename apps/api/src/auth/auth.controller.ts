import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from '../common/dto/login.dto';
import { JwtAuthGuard } from './jwt.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  login(@Body() body: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(body.email, body.password, body.role, ip, userAgent);
  }

  @Post('refresh')
  @Throttle({ short: { ttl: 60000, limit: 10 } }) // rộng hơn login vì client tự gọi ngầm khi access token hết hạn
  refresh(@Body() body: { refreshToken: string }, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshAccessToken(body.refreshToken, ip, userAgent);
  }

  @Post('logout')
  logout(@Body() body: { refreshToken: string }) {
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
    @Body() body: { oldPassword: string; newPassword: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    return this.authService.changePassword(id, body.oldPassword, body.newPassword, ip);
  }

  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  register(
    @Body() body: { mssv: string; email: string; password: string; role: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    return this.authService.registerStudent(body.mssv, body.email, body.password, ip);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listUsers() {
    return this.authService.findAllUsers();
  }
}