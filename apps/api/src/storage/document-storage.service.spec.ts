import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentStorageService } from './document-storage.service';

describe('Document storage integrity', () => {
  let directory: string;
  let environment: NodeJS.ProcessEnv;
  const service = new DocumentStorageService();
  const buffer = Buffer.from('fixture document bytes');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  beforeEach(async () => {
    environment = { ...process.env };
    directory = await mkdtemp(join(tmpdir(), 'registry-storage-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = directory;
  });
  afterEach(async () => {
    process.env = environment;
    await rm(directory, { recursive: true, force: true });
  });
  it.each(['xlsx', 'pdf'] as const)(
    'round-trips checksum-verified %s documents',
    async (format) => {
      const key = await service.put(randomUUID(), sha256, buffer, format);
      const result =
        format === 'xlsx'
          ? await service.getWorkbook(key, sha256)
          : await service.getPdf(key, sha256);
      expect(result).toEqual(buffer);
    },
  );
  it('rejects paths outside storage and document type mismatches', async () => {
    await expect(
      service.getWorkbook('../source.xlsx', sha256),
    ).rejects.toThrow();
    const key = await service.put(randomUUID(), sha256, buffer, 'pdf');
    await expect(service.getWorkbook(key, sha256)).rejects.toThrow();
    await expect(service.getPdf(key, 'b'.repeat(64))).rejects.toThrow();
  });
  it('refuses a workbook whose stored bytes were modified', async () => {
    const key = await service.put(randomUUID(), sha256, buffer);
    await writeFile(join(directory, key), 'tampered');
    await expect(service.getWorkbook(key, sha256)).rejects.toThrow('checksum');
  });
});
