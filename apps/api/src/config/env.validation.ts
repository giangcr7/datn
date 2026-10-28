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
  PDF_SIGNING_MODE: Joi.string()
    .valid('disabled', 'demo', 'certificate')
    .default('disabled'),
  PDF_PKI_ENABLED: Joi.boolean().default(false),
  PDF_TSA_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  PDF_PKI_TRUST_BUNDLE_PATH: Joi.string().allow('').optional(),
  PDF_PKI_ISSUERS_PATH: Joi.string().allow('').optional(),
  PDF_PKI_ENDPOINTS_PATH: Joi.string().allow('').optional(),
  PDF_PKI_ALLOWED_HOSTS: Joi.string().allow('').optional(),
  PDF_PKI_TIMEOUT_MS: Joi.number().integer().min(100).max(10000).default(5000),
  PDF_PKI_MAX_AGE_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(604800)
    .default(86400),
  PDF_PKI_CACHE_SECONDS: Joi.number().integer().min(0).max(300).default(0),
  NODE_TLS_REJECT_UNAUTHORIZED: Joi.string().optional(),
})
  .unknown(true)
  .custom((value, helpers) => {
    if (value.NODE_ENV === 'production' && value.PDF_SIGNING_MODE === 'demo')
      return helpers.message({
        custom: 'Không sử dụng chứng thư PDF demo trên production',
      });
    if (value.PDF_SIGNING_MODE !== 'disabled') {
      for (const prefix of ['ORG2']) {
        const required = [
          'PASSWORD',
          'CERT_SHA256',
          ...(value.PDF_SIGNING_MODE === 'demo'
            ? ['CERT_PATH', 'KEY_PATH']
            : ['P12_PATH']),
        ];
        if (required.some((field) => !value['PDF_' + prefix + '_' + field]))
          return helpers.message({
            custom: 'Thiếu cấu hình chứng thư PDF ' + prefix,
          });
        if (!/^[0-9a-f]{64}$/i.test(value['PDF_' + prefix + '_CERT_SHA256']))
          return helpers.message({
            custom: 'Fingerprint chứng thư PDF phải là SHA-256 (64 hex)',
          });
      }
    }
    if (value.PDF_PKI_ENABLED) {
      if (
        [
          'PDF_TSA_URL',
          'PDF_PKI_TRUST_BUNDLE_PATH',
          'PDF_PKI_ENDPOINTS_PATH',
          'PDF_PKI_ALLOWED_HOSTS',
        ].some((key) => !value[key])
      )
        return helpers.message({
          custom:
            'Thiếu cấu hình TSA, trust store, endpoint OCSP/CRL hoặc host PKI',
        });
      const url = new URL(value.PDF_TSA_URL);
      if (
        !value.PDF_PKI_ALLOWED_HOSTS.split(',')
          .map((host: string) => host.trim().toLowerCase())
          .includes(url.host.toLowerCase())
      )
        return helpers.message({
          custom: 'Host TSA phải nằm trong PDF_PKI_ALLOWED_HOSTS',
        });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.PDF_SIGNING_MODE === 'certificate' &&
      !value.PDF_PKI_ENABLED
    )
      return helpers.message({
        custom: 'Production phải bật TSA và kiểm tra thu hồi chứng thư',
      });
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
