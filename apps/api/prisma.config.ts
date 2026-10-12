import { config } from 'dotenv';
import * as path from 'node:path';
import { defineConfig } from 'prisma/config';

config({ path: path.join(__dirname, '.env') });
config({ path: path.join(__dirname, '.env.database') });

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma/migrations'),
    seed: 'npm run db:seed:run -w api',
  },
  datasource: {
    url:
      process.env.DIRECT_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://localhost:5432/diplomachain',
  },
});
