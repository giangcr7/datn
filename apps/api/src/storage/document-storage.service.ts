import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class DocumentStorageService {
  async put(institutionId: string, sha256: string, buffer: Buffer) {
    if (
      !/^[0-9a-f-]{36}$/i.test(institutionId) ||
      !/^[0-9a-f]{64}$/.test(sha256)
    )
      throw new Error('Invalid storage key');
    const storageKey = institutionId + '/' + sha256 + '.xlsx';
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
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
    const target = join(directory, institutionId, sha256 + '.xlsx');
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
}
