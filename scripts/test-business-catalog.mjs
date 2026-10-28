import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: new URL("../apps/api/.env", import.meta.url), quiet: true });
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const {
  CatalogService,
} = require("../apps/api/dist/catalog/catalog.service.js");
const {
  RegistryImportService,
} = require("../apps/api/dist/imports/registry-import.service.js");
const { AuditService } = require("../apps/api/dist/audit/audit.service.js");
const { Test } = require("@nestjs/testing");
const { ValidationPipe } = require("@nestjs/common");
const {
  DatabaseModule,
} = require("../apps/api/dist/database/database.module.js");
const { CatalogModule } = require("../apps/api/dist/catalog/catalog.module.js");
const { AuditModule } = require("../apps/api/dist/audit/audit.module.js");
const { JwtAuthGuard } = require("../apps/api/dist/auth/jwt.guard.js");
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error("ROLLBACK_BUSINESS_MENU_TEST");
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
async function rejects(label, callback, status) {
  await assert.rejects(
    callback,
    (error) => error.getStatus?.() === status,
    label,
  );
  checks++;
}

try {
  await database.$transaction(
    async (transaction) => {
      const institution = await transaction.institution.create({
        data: {
          code: "MENU_" + randomUUID().slice(0, 24),
          name: "Menu regression institution",
        },
      });
      const campus = await transaction.campus.create({
        data: {
          institutionId: institution.id,
          code: "MAIN",
          name: "Main campus",
          isHeadquarters: true,
        },
      });
      const account = await transaction.account.create({
        data: {
          email: randomUUID() + "@example.test",
          displayName: "Menu regression officer",
          passwordHash: "not-a-login-secret",
        },
      });
      await transaction.accountMembership.create({
        data: {
          accountId: account.id,
          campusId: campus.id,
          role: "UNIVERSITY",
          canApproveDiplomas: true,
        },
      });
      const actor = {
        id: account.id,
        email: account.email,
        role: "university",
        institutionId: institution.id,
        campusId: campus.id,
        isHeadquarters: true,
        canApproveDiplomas: true,
      };
      let savepoint = 0;
      const nested = async (callback) => {
        const name = "menu_" + ++savepoint;
        await transaction.$executeRawUnsafe("SAVEPOINT " + name);
        try {
          const result = await callback(transaction);
          await transaction.$executeRawUnsafe("RELEASE SAVEPOINT " + name);
          return result;
        } catch (error) {
          await transaction.$executeRawUnsafe("ROLLBACK TO SAVEPOINT " + name);
          await transaction.$executeRawUnsafe("RELEASE SAVEPOINT " + name);
          throw error;
        }
      };
      const scoped = new Proxy(transaction, {
        get(target, key) {
          if (key === "$transaction") return nested;
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const catalog = new CatalogService(scoped);
      const imports = new RegistryImportService(scoped, {});
      const audit = new AuditService(scoped);
      const input = {
        code: "TEST_IT",
        name: "Ngành kiểm thử",
        nameEn: "Regression Program",
        note: "Regression fixture only",
      };
      const program = await catalog.save(input, actor);
      const list = await catalog.list(actor);
      check(
        "catalog returns the institution program with its canonical alias",
        list.length === 1 && list[0].aliases[0].originalName === input.name,
      );
      await imports.addProgramAlias(
        program.id,
        "Tên ngành từ Excel",
        "Confirmed source label",
        actor,
      );
      const alias = await transaction.programAlias.findUnique({
        where: {
          institutionId_normalizedName: {
            institutionId: actor.institutionId,
            normalizedName: "tên ngành từ excel",
          },
        },
      });
      check(
        "new mapping is available to the existing registry parser",
        alias?.programId === program.id && alias.approvedById === actor.id,
      );
      await rejects(
        "duplicate aliases are not overwritten",
        () =>
          imports.addProgramAlias(
            program.id,
            "Tên ngành từ Excel",
            "Duplicate",
            actor,
          ),
        409,
      );
      await rejects(
        "duplicate program codes produce a readable conflict",
        () => catalog.save({ ...input, name: "Another program" }, actor),
        409,
      );
      await catalog.save(
        {
          ...input,
          nameEn: "Updated Regression Program",
          note: "Correct English name",
        },
        actor,
        program.id,
      );
      const updated = await catalog.list(actor);
      check(
        "program edits preserve existing mappings",
        updated[0].aliases.length === 2 &&
          updated[0].nameEn === "Updated Regression Program",
      );
      const logs = await audit.findAll(actor, 1, 20);
      check(
        "officer can read transactionally recorded business actions",
        logs.total === 3 &&
          logs.data.every((entry) => entry.institutionId === institution.id),
      );
      const filtered = await audit.findAll(actor, 1, 20, "UPDATE_PROGRAM", {
        search: actor.email,
        result: "SUCCESS",
      });
      check(
        "audit filters apply to list and count consistently",
        filtered.total === 1 && filtered.data[0].action === "UPDATE_PROGRAM",
      );
      const otherInstitution = await transaction.institution.create({
        data: {
          code: "OTHER_" + randomUUID().slice(0, 24),
          name: "Other institution",
        },
      });
      const foreignActor = { ...actor, institutionId: otherInstitution.id };
      check(
        "catalog does not leak another institution programs",
        (await catalog.list(foreignActor)).length === 0,
      );
      check(
        "activity does not leak another institution logs",
        (await audit.findAll(foreignActor)).total === 0,
      );
      await rejects(
        "foreign program cannot be edited",
        () => catalog.save(input, foreignActor, program.id),
        404,
      );
      for (const flags of [
        { role: "admin" },
        { role: "student" },
        { isHeadquarters: false },
        { canApproveDiplomas: false },
      ]) {
        await rejects(
          "catalog rejects unauthorized actor " + JSON.stringify(flags),
          async () => catalog.list({ ...actor, ...flags }),
          403,
        );
      }
      await rejects(
        "students cannot read institutional logs",
        () => audit.findAll({ ...actor, role: "student" }),
        403,
      );
      await rejects(
        "archived staff cannot read institutional logs",
        () => audit.findAll({ ...actor, isHeadquarters: false }),
        403,
      );
      check(
        "admin retains read-only activity access",
        (await audit.findAll({ ...actor, role: "admin" })).total === 3,
      );
      let httpActor = actor;
      const module = await Test.createTestingModule({
        imports: [DatabaseModule, CatalogModule, AuditModule],
      })
        .overrideProvider(DatabaseService)
        .useValue({
          program: transaction.program,
          programAlias: transaction.programAlias,
          auditLog: transaction.auditLog,
          $transaction: nested,
        })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context) {
            context.switchToHttp().getRequest().user = httpActor;
            return true;
          },
        })
        .compile();
      const app = module.createNestApplication({ logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.listen(0, "127.0.0.1");
      const url = await app.getUrl();
      try {
        const request = async (path, body, method = "POST") =>
          fetch(
            url + path,
            body
              ? {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                }
              : undefined,
          );
        const programsResponse = await request("/catalog/programs");
        check(
          "catalog HTTP route returns the scoped catalog",
          programsResponse.ok && (await programsResponse.json()).length === 1,
        );
        const activityResponse = await request(
          "/audit?page=1&limit=20&action=UPDATE_PROGRAM",
        );
        check(
          "audit HTTP filters and DTO defaults work",
          activityResponse.ok && (await activityResponse.json()).total === 1,
        );
        check(
          "invalid audit pagination is rejected by DTO",
          (await request("/audit?page=0")).status === 400,
        );
        check(
          "unrecognized audit filters are rejected",
          (await request("/audit?institutionId=other")).status === 400,
        );
        check(
          "invalid catalog payload is rejected by DTO",
          (await request("/catalog/programs", { code: "INVALID" })).status ===
            400,
        );
        const created = await request("/catalog/programs", {
          ...input,
          code: "TEST_HTTP",
          name: "Ngành HTTP",
          nameEn: "HTTP Program",
        });
        check(
          "catalog HTTP mutation writes a real program transactionally",
          created.status === 201 && (await created.json()).code === "TEST_HTTP",
        );
        httpActor = { ...actor, role: "student" };
        check(
          "student is denied catalog HTTP access",
          (await request("/catalog/programs")).status === 403,
        );
        check(
          "student is denied audit HTTP access",
          (await request("/audit")).status === 403,
        );
        httpActor = { ...actor, isHeadquarters: false };
        check(
          "archived officer is denied catalog HTTP access",
          (await request("/catalog/programs")).status === 403,
        );
        check(
          "archived officer is denied audit HTTP access",
          (await request("/audit")).status === 403,
        );
        httpActor = { ...actor, role: "admin" };
        check(
          "admin cannot mutate the business catalog",
          (await request("/catalog/programs", input)).status === 403,
        );
        check(
          "admin can still read audit HTTP route",
          (await request("/audit")).ok,
        );
      } finally {
        await app.close();
      }
      throw rollback;
    },
    { timeout: 60000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await database.$disconnect();
}
console.log(
  "Business catalog/database checks passed: " +
    checks +
    ". All fixtures rolled back; no blockchain writes.",
);
