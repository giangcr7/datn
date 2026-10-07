import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const isProduction = process.env.NODE_ENV === 'production';

// Level mặc định: debug lúc dev (xem chi tiết khi code),
// info lúc production (giảm nhiễu + giảm dung lượng log).
// Có thể override bằng biến môi trường LOG_LEVEL nếu cần.
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

export const winstonConfig = {
  level,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        nestWinstonModuleUtilities.format.nestLike('DiplomaChain', {
          prettyPrint: true,
        }),
      ),
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d', // tự xoá log cũ hơn 14 ngày
      format: fileFormat,
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
  ],
  // Bắt riêng exception/rejection ngoài luồng Nest — không bị mất log khi crash bất ngờ
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
  ],
};
