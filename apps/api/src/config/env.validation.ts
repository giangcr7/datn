import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  EMAIL_USER: Joi.string().allow('').optional(),
  EMAIL_PASS: Joi.string().allow('').optional(),
  EMAIL_FROM: Joi.string().allow('').optional(),
  FABRIC_ENABLED: Joi.boolean().default(false),
  FABRIC_NETWORK_BASE: Joi.string().when('FABRIC_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  FABRIC_CHANNEL: Joi.string().default('mychannel'),
  FABRIC_CHAINCODE: Joi.string().default('educert'),
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  STORAGE_LOCAL_ROOT: Joi.string().optional(),
  STORAGE_S3_BUCKET: Joi.string().optional(),
  WEB_URL: Joi.string().uri().default('http://localhost:3000'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').optional(),
  PUBLIC_DIRECTORY_ENABLED: Joi.boolean().default(false),
  OUTBOX_ENABLED: Joi.boolean().default(true),
  NODE_TLS_REJECT_UNAUTHORIZED: Joi.string().optional(),
})
  .unknown(true)
  .custom((value, helpers) => {
    if (
      value.NODE_ENV === 'production' &&
      (value.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
        value.FABRIC_TLS_SKIP_VERIFY === 'true')
    )
      return helpers.message({
        custom: 'Production không được tắt xác thực TLS',
      });
    if (value.STORAGE_DRIVER === 's3' && !value.STORAGE_S3_BUCKET)
      return helpers.message({ custom: 'Thiếu STORAGE_S3_BUCKET' });
    return value;
  });
