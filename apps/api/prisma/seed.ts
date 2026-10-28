import { config } from 'dotenv';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client';
import { hash } from 'bcryptjs';
import { lookupText } from '../src/database/data-utils';

config({ path: join(__dirname, '../.env') });
const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const institution = await database.institution.upsert({
    where: { code: 'TLU' },
    update: {},
    create: {
      code: 'TLU',
      name: 'Trường Đại học Thủy lợi',
      nameEn: 'Thuyloi University',
    },
  });
  const campuses = new Map<string, string>();
  for (const [code, name, msp] of [
    ['ORG2', 'Cơ sở chính TP. Hồ Chí Minh', 'Org1MSP'],
  ]) {
    const campus = await database.campus.upsert({
      where: { institutionId_code: { institutionId: institution.id, code } },
      update: {},
      create: {
        institutionId: institution.id,
        code,
        name,
        fabricMspId: msp,
        isHeadquarters: true,
      },
    });
    campuses.set(code, campus.id);
  }
  const programs: [string, string, string][] = [
    ['WATER_WORKS_LEGACY', 'Kỹ thuật công trình thủy', 'Hydraulic Engineering'],
    ['CIVIL_LEGACY', 'Kỹ thuật công trình xây dựng', 'Civil Engineering'],
    ['WATER_SUPPLY_LEGACY', 'Cấp thoát nước', 'Water Supply and Drainage'],
    [
      'WATER_WORKS',
      'Kỹ thuật xây dựng công trình thủy',
      'Hydraulic Engineering',
    ],
    ['CIVIL', 'Kỹ thuật xây dựng', 'Civil Engineering'],
    [
      'WATER_SUPPLY',
      'Kỹ thuật cấp thoát nước',
      'Water Supply and Drainage Engineering',
    ],
    [
      'TRANSPORT',
      'Kỹ thuật xây dựng công trình giao thông',
      'Transport Infrastructure Engineering',
    ],
    [
      'WATER_RESOURCES',
      'Kỹ thuật tài nguyên nước',
      'Water Resources Engineering',
    ],
    [
      'CONSTRUCTION_TECH',
      'Công nghệ kỹ thuật xây dựng',
      'Civil Engineering Technology',
    ],
    ['ACCOUNTING', 'Kế toán', 'Accounting'],
    ['IT', 'Công nghệ thông tin', 'Information Technology'],
    ['BUSINESS', 'Quản trị kinh doanh', 'Business Administration'],
    [
      'LOGISTICS',
      'Logistics và quản lý chuỗi cung ứng',
      'Logistics and Supply Chain Management',
    ],
  ];
  for (const [code, name, nameEn] of programs) {
    const program = await database.program.upsert({
      where: { institutionId_code: { institutionId: institution.id, code } },
      update: {},
      create: { institutionId: institution.id, code, name, nameEn },
    });
    await database.programAlias.upsert({
      where: {
        institutionId_normalizedName: {
          institutionId: institution.id,
          normalizedName: lookupText(name),
        },
      },
      update: {},
      create: {
        institutionId: institution.id,
        programId: program.id,
        originalName: name,
        normalizedName: lookupText(name),
      },
    });
  }
  for (const [prefix, role, campusCode] of [
    ['ADMIN', Role.ADMIN, 'ORG2'],
    ['ORG2', Role.UNIVERSITY, 'ORG2'],
  ] as const) {
    const email = process.env[`BOOTSTRAP_${prefix}_EMAIL`]
      ?.trim()
      .toLowerCase();
    const password = process.env[`BOOTSTRAP_${prefix}_PASSWORD`];
    if (!email || !password) continue;
    if (password.length < 12)
      throw new Error('Bootstrap password must have at least 12 characters');
    const account = await database.account.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: await hash(password, 12),
        displayName: `TLU ${prefix}`,
        mustChangePassword: true,
      },
    });
    const campusId = campuses.get(campusCode)!;
    await database.accountMembership.upsert({
      where: {
        accountId_campusId_role: { accountId: account.id, campusId, role },
      },
      update: {},
      create: {
        accountId: account.id,
        campusId,
        role,
        canApproveDiplomas: role === Role.UNIVERSITY,
      },
    });
  }
  console.log(
    'Seed completed: institution, one main campus, one university officer role, 13 program labels. Existing passwords are unchanged.',
  );
}

main()
  .finally(() => database.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
