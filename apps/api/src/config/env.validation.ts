import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),

  MONGODB_URI: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET phải có ít nhất 32 ký tự để đảm bảo an toàn',
  }),

  EMAIL_USER: Joi.string().required(),
  EMAIL_PASS: Joi.string().required(),
  EMAIL_FROM: Joi.string().required(),

  // Bắt buộc — thiếu biến này khiến FabricService fallback về path sai
  // (đã từng gây lỗi ENOENT thực tế trong quá trình phát triển, xem báo cáo mục Health Check)
  FABRIC_NETWORK_BASE: Joi.string().required(),

  WEB_URL: Joi.string().uri().optional(),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').optional(),

  // Chỉ dùng để né lỗi TLS cert lúc dev với Fabric — TUYỆT ĐỐI không được bật ở production
  // (tắt xác thực TLS = mở đường cho man-in-the-middle attack)
  NODE_TLS_REJECT_UNAUTHORIZED: Joi.string().optional(),
})
  .unknown(true) // cho phép các biến khác như PEER_ENDPOINT, TLS_CERT_PATH...
  .custom((value, helpers) => {
    if (value.NODE_ENV === 'production' && value.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      return helpers.message({
        custom:
          'NODE_TLS_REJECT_UNAUTHORIZED=0 không được phép bật khi NODE_ENV=production (tắt xác thực TLS, mất an toàn kết nối Fabric)',
      });
    }
    return value;
  });