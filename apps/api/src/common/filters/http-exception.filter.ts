import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exRes = exception.getResponse();

    const message =
      typeof exRes === 'string'
        ? exRes
        : (exRes as any).message || exception.message;

    const body = {
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      path: req.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(
      `[${req.method}] ${req.url} → ${status}: ${JSON.stringify(message)}`,
    );
    res.status(status).json(body);
  }
}
