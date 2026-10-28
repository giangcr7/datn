import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class DocumentStorageService {
  async put(
    institutionId: string,
    sha256: string,
    buffer: Buffer,
    format: 'xlsx' | 'pdf' = 'xlsx',
  ) {
    if (
      !/^[0-9a-f-]{36}$/i.test(institutionId) ||
      !/^[0-9a-f]{64}$/.test(sha256)
    )
      throw new Error('Invalid storage key');
    if (createHash('sha256').update(buffer).digest('hex') !== sha256)
      throw new Error('Storage checksum mismatch');
    const storageKey = institutionId + '/' + sha256 + '.' + format;
    if ((process.env.STORAGE_DRIVER || 'local') === 's3') {
      if (!process.env.STORAGE_S3_BUCKET)
        throw new ServiceUnavailableException('S3 bucket chưa cấu hình');
      const client = new S3Client({
        region: process.env.AWS_REGION || 'ap-southeast-1',
        endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
        forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
      });
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.STORAGE_S3_BUCKET,
            Key: storageKey,
            Body: buffer,
            ContentType:
              format === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
            ServerSideEncryption: process.env.STORAGE_S3_KMS_KEY_ID
              ? 'aws:kms'
              : 'AES256',
            SSEKMSKeyId: process.env.STORAGE_S3_KMS_KEY_ID || undefined,
            IfNoneMatch: '*',
          }),
        );
      } catch (error: any) {
        if (error.$metadata?.httpStatusCode !== 412) throw error;
      } finally {
        client.destroy();
      }
      return storageKey;
    }
    if ((process.env.STORAGE_DRIVER || 'local') !== 'local')
      throw new ServiceUnavailableException('Storage driver không hỗ trợ');
    const directory = resolve(
      process.env.STORAGE_LOCAL_ROOT || '../../.data/documents',
    );
    const target = join(directory, institutionId, sha256 + '.' + format);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      const stored = await readFile(target);
      if (createHash('sha256').update(stored).digest('hex') !== sha256)
        throw new ServiceUnavailableException(
          'File nguồn trùng key nhưng sai checksum',
        );
    }
    return storageKey;
  }

  async getPdf(storageKey: string, sha256: string) {
    return this.getDocument(storageKey, sha256, 'pdf');
  }

  async getWorkbook(storageKey: string, sha256: string) {
    return this.getDocument(storageKey, sha256, 'xlsx');
  }

  private async getDocument(
    storageKey: string,
    sha256: string,
    format: 'pdf' | 'xlsx',
  ) {
    if (
      !/^[0-9a-f-]{36}\/[0-9a-f]{64}\.(pdf|xlsx)$/i.test(storageKey) ||
      storageKey.split('/')[1] !== sha256 + '.' + format
    )
      throw new ServiceUnavailableException('Đường dẫn tài liệu không hợp lệ');
    let buffer: Buffer;
    if ((process.env.STORAGE_DRIVER || 'local') === 's3') {
      const client = new S3Client({
        region: process.env.AWS_REGION || 'ap-southeast-1',
        endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
        forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
      });
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: process.env.STORAGE_S3_BUCKET,
            Key: storageKey,
          }),
        );
        if (!result.Body) throw new Error('Missing document');
        buffer = Buffer.from(await result.Body.transformToByteArray());
      } finally {
        client.destroy();
      }
    } else if ((process.env.STORAGE_DRIVER || 'local') === 'local') {
      buffer = await readFile(
        join(
          resolve(process.env.STORAGE_LOCAL_ROOT || '../../.data/documents'),
          storageKey,
        ),
      );
    } else throw new ServiceUnavailableException('Storage driver không hỗ trợ');
    if (createHash('sha256').update(buffer).digest('hex') !== sha256)
      throw new ServiceUnavailableException(
        'Tài liệu lưu trữ không khớp checksum; không sử dụng file',
      );
    return buffer;
  }
}
