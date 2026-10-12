import { config } from 'dotenv';
import { basename, resolve, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';
import { RegistryImportService } from '../src/imports/registry-import.service';
import { DocumentStorageService } from '../src/storage/document-storage.service';
import { AuthService } from '../src/auth/auth.service';

config({ path: join(__dirname, '../.env') });
const database = new DatabaseService(new ConfigService(process.env));
const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
async function main() {
  const filename = arg('--file');
  if (!filename)
    throw new Error(
      'Usage: npm run registry:inspect -w api -- --file <xlsx> [--stage] [--actor-email <email>] [--report <json>]',
    );
  const email = arg('--actor-email') || process.env.BOOTSTRAP_ORG2_EMAIL;
  if (!email) throw new Error('Actor email is required');
  const account = await database.account.findUniqueOrThrow({
    where: { email },
    include: {
      student: true,
      memberships: { where: { active: true }, include: { campus: true } },
    },
  });
  const membership = account.memberships.find(
    (item) => item.role === 'UNIVERSITY' || item.role === 'ADMIN',
  );
  if (!membership) throw new Error('Actor must be staff');
  const auth = new AuthService(
    database,
    undefined as any,
    undefined as any,
    undefined as any,
  );
  const actor = auth.actor(account as any, membership.id);
  const service = new RegistryImportService(
    database,
    new DocumentStorageService(),
  );
  const buffer = await readFile(resolve(filename));
  const result = process.argv.includes('--stage')
    ? await service.import(basename(filename), buffer.toString('base64'), actor)
    : await service.preview(
        basename(filename),
        buffer.toString('base64'),
        actor,
      );
  const report = {
    scannedAt: new Date().toISOString(),
    fileName: basename(filename),
    mappingVersion: 'tlu-register-v1',
    ...result,
    ...('rows' in result ? { rows: undefined } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  if (arg('--report'))
    await writeFile(
      resolve(arg('--report')!),
      JSON.stringify(report, null, 2) + '\n',
    );
}
main()
  .finally(() => database.$disconnect())
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
