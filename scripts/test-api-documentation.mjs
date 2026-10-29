import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import "reflect-metadata";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(resolve(root, path), "utf8");
const collection = JSON.parse(
  await read("docs/database/api-test-samples.postman_collection.json"),
);
const environment = JSON.parse(
  await read("docs/database/api-test-samples.postman_environment.json"),
);
const guide = await read("docs/database/api-test-samples.md");
const tables = await read("docs/database/vai-tro-cac-bang-va-chuc-nang.md");
const schema = await read("apps/api/prisma/schema.prisma");
const requests = collection.item.flatMap((folder) => folder.item);
const variables = Object.fromEntries(
  collection.variable.map(({ key, value }) => [key, value]),
);
const environmentVariables = Object.fromEntries(
  environment.values.map(({ key, value }) => [key, value]),
);
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
function same(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

same(
  collection.info.schema,
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  "Postman v2.1",
);
same(collection.item.length, 13, "13 functional folders");
same(requests.length, 86, "86 requests including workflow alternatives");
same(environmentVariables, variables, "environment defaults match collection");
same(
  new Set(collection.variable.map((variable) => variable.key)).size,
  collection.variable.length,
  "unique variables",
);
for (const flag of ["allowMutations", "allowSensitiveActions"])
  same(variables[flag], "false", "mutations disabled by default: " + flag);
for (const [key, value] of Object.entries(variables)) {
  if (/Password|Token|^otp$|Base64$/.test(key))
    same(value, "", "no exported secret or workbook: " + key);
}
check(
  "no old headquarters login variables",
  !Object.hasOwn(variables, "headquartersToken"),
);
const tableNames = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(
  (match) => match[1],
);
same(tableNames.length, 27, "27 Prisma application tables");
const documentedTables = [
  ...tables.matchAll(/^\|\s+\x60([a-z_]+)\x60\s+\|/gm),
].map((match) => match[1]);
same(
  documentedTables.sort(),
  [...tableNames].sort(),
  "every table described exactly once",
);
check(
  "migration metadata distinguished",
  tables.includes("_prisma_migrations"),
);
check(
  "ledger is not a SQL table",
  tables.includes("Không phải sổ cái blockchain"),
);
check(
  "single-campus model documented",
  tables.includes("một cơ sở chính TP.HCM"),
);

function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}
function annotation(node, name) {
  return decorators(node).find(
    (decorator) =>
      ts.isCallExpression(decorator.expression) &&
      decorator.expression.expression.getText() === name,
  )?.expression;
}
const controllers = (
  await readdir(resolve(root, "apps/api/src"), { recursive: true })
).filter((path) => path.endsWith(".controller.ts"));
const routes = [];
for (const path of controllers) {
  const absolutePath = resolve(root, "apps/api/src", path);
  const code = await readFile(absolutePath, "utf8");
  const parsed = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
  for (const declaration of parsed.statements.filter(ts.isClassDeclaration)) {
    const controller = annotation(declaration, "Controller");
    if (!controller) continue;
    const prefix = controller.arguments[0]?.text || "";
    for (const member of declaration.members.filter(ts.isMethodDeclaration)) {
      for (const verb of ["Get", "Post", "Patch", "Put", "Delete"]) {
        const endpoint = annotation(member, verb);
        if (!endpoint) continue;
        const route =
          "/" + [prefix, endpoint.arguments[0]?.text].filter(Boolean).join("/");
        const body = member.parameters.find((parameter) =>
          annotation(parameter, "Body"),
        );
        const query = member.parameters.find((parameter) => {
          const decorator = annotation(parameter, "Query");
          return decorator && !decorator.arguments.length;
        });
        const bodyName =
          body && ts.isTypeReferenceNode(body.type)
            ? body.type.typeName.getText()
            : undefined;
        const queryName =
          query && ts.isTypeReferenceNode(query.type)
            ? query.type.typeName.getText()
            : undefined;
        routes.push({
          verb: verb.toUpperCase(),
          route,
          parsed,
          absolutePath,
          bodyName,
          queryName,
        });
      }
    }
  }
}
function routeMatches(pattern, path) {
  const wanted = pattern.split("/");
  const actual = path.split("/");
  return (
    wanted.length === actual.length &&
    wanted.every(
      (part, index) => part.startsWith(":") || part === actual[index],
    )
  );
}
const substitutes = {
  ...variables,
  staffEmail: "officer@example.com",
  adminEmail: "admin@example.com",
  programId: "11111111-1111-4111-8111-111111111111",
  programCode: "TEST-OFFLINE",
  expectedRetryToken: "a".repeat(64),
  correctionUpdatedAt: "2026-10-29T01:00:00.000Z",
  sourceUpdatedAt: "2026-10-29T01:00:00.000Z",
  replacementUpdatedAt: "2026-10-29T01:00:00.000Z",
  xlsxBase64: "UEsDBA==",
  studentXlsxBase64: "UEsDBA==",
  otp: "123456",
};
for (const [key, value] of Object.entries(substitutes)) {
  if (!value)
    substitutes[key] = /UUID$|Id$/.test(key)
      ? "22222222-2222-4222-8222-222222222222"
      : "Offline-Example-Only";
}
function substitute(value) {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => substitutes[key]);
}
const dtoCache = new Map();
function compileDto(absolutePath) {
  if (dtoCache.has(absolutePath)) return dtoCache.get(absolutePath);
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  }).outputText;
  const exported = {};
  dtoCache.set(absolutePath, exported);
  const nativeRequire = createRequire(absolutePath);
  const requireDto = (specifier) => {
    if (!specifier.startsWith(".")) return nativeRequire(specifier);
    const relative = specifier.endsWith("/generated/prisma/client")
      ? specifier.replace(/client$/, "enums")
      : specifier;
    return compileDto(resolve(dirname(absolutePath), relative + ".ts"));
  };
  new Function("require", "exports", compiled)(requireDto, exported);
  return exported;
}
async function loadDto(route, name) {
  const declaration = route.parsed.statements
    .filter(ts.isImportDeclaration)
    .find(
      (statement) =>
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings) &&
        statement.importClause.namedBindings.elements.some(
          (element) => element.name.text === name,
        ),
    );
  assert(declaration, "DTO import exists: " + name);
  const element = declaration.importClause.namedBindings.elements.find(
    (item) => item.name.text === name,
  );
  const absolutePath = resolve(
    dirname(route.absolutePath),
    declaration.moduleSpecifier.text + ".ts",
  );
  return compileDto(absolutePath)[element.propertyName?.text || name];
}
async function validateDto(route, name, input, label) {
  const Dto = await loadDto(route, name);
  const errors = await validate(plainToInstance(Dto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  same(
    errors.map((error) => ({
      field: error.property,
      errors: error.constraints,
      children: error.children,
    })),
    [],
    label,
  );
}

const coveredRoutes = new Set();
for (const item of requests) {
  const request = item.request;
  const text = JSON.stringify(request);
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g))
    check(
      item.name + ": declared variable " + match[1],
      Object.hasOwn(variables, match[1]),
    );
  const fullUrl = request.url
    .replace("{{baseUrl}}", variables.baseUrl)
    .replace("{{webUrl}}", variables.webUrl);
  check(item.name + ": URL in guide", guide.includes(fullUrl));
  const scripts =
    item.event?.flatMap((event) => event.script.exec).join("\n") || "";
  new vm.Script(scripts);
  check(
    item.name + ": response assertions included",
    scripts.includes("pm.test("),
  );
  if (request.url.startsWith("{{webUrl}}")) {
    same(request.url, "{{webUrl}}/api/assistant", "only chat uses web port");
    same(
      JSON.parse(request.body.raw).question.length <= 800,
      true,
      "chat input within length limit",
    );
    check(
      "chat origin header",
      request.header.some(
        (header) => header.key === "Origin" && header.value === "{{webUrl}}",
      ),
    );
    continue;
  }
  const path = request.url.replace("{{baseUrl}}", "").split("?")[0];
  const matches = routes.filter(
    (route) => route.verb === request.method && routeMatches(route.route, path),
  );
  matches.sort(
    (first, second) =>
      first.route.split(":").length - second.route.split(":").length,
  );
  const route = matches[0];
  check(item.name + ": real controller route", !!route);
  coveredRoutes.add(route.verb + " " + route.route);
  if (request.body?.mode === "raw" && route.bodyName)
    await validateDto(
      route,
      route.bodyName,
      JSON.parse(substitute(request.body.raw)),
      item.name + ": body matches DTO",
    );
  if (route.queryName) {
    const query = Object.fromEntries(new URL(substitute(fullUrl)).searchParams);
    await validateDto(
      route,
      route.queryName,
      query,
      item.name + ": query matches DTO",
    );
  }
  if (request.body?.mode === "formdata") {
    same(
      request.body.formdata.map(({ key, type }) => ({ key, type })),
      [{ key: "file", type: "file" }],
      "PDF multipart file field",
    );
    check(
      "multipart boundary left to Postman",
      !request.header.some(
        (header) => header.key.toLowerCase() === "content-type",
      ),
    );
  }
  if (
    request.method !== "GET" &&
    request.auth.type === "bearer" &&
    !path.endsWith("/check") &&
    path !== "/imports/registry/preview"
  )
    check(
      item.name + ": database mutation labelled",
      /^\[(GHI|NHAY_CAM)\]/.test(item.name),
    );
}
const excluded = new Set([
  "GET /",
  "POST /cert/issue",
  "POST /cert/:uuid/sign",
  "POST /cert/:uuid/submit",
]);
for (const route of routes) {
  const key = route.verb + " " + route.route;
  check(
    "controller endpoint documented or explicitly excluded: " + key,
    coveredRoutes.has(key) || excluded.has(key),
  );
}
for (const limit of [
  "/cert/issue",
  "/cert/:uuid/sign",
  "/cert/:uuid/submit",
  "/explorer/blocks/:number",
])
  check("known limitation documented: " + limit, guide.includes(limit));

const guard = collection.event
  .find((event) => event.listen === "prerequest")
  .script.exec.join("\n");
function skipped(item, overrides = {}) {
  let count = 0;
  const values = { ...substitutes, ...overrides };
  const auth = item.request.auth;
  vm.runInNewContext(guard, {
    console: { warn() {} },
    pm: {
      info: { requestName: item.name },
      variables: { get: (key) => values[key] },
      execution: { skipRequest: () => count++ },
      request: {
        url: { toString: () => item.request.url },
        body: item.request.body,
        auth: {
          ...auth,
          bearer: {
            get: (key) =>
              auth.bearer?.find((field) => field.key === key)?.value,
          },
        },
      },
    },
  });
  return count > 0;
}
for (const item of requests) {
  const sensitive = item.name.startsWith("[NHAY_CAM]");
  const writes = /^\[(GHI|NHAY_CAM)\]/.test(item.name);
  same(skipped(item), writes, item.name + ": default guard behavior");
  same(
    skipped(item, { allowMutations: "true", allowSensitiveActions: "true" }),
    false,
    item.name + ": explicitly enabled",
  );
  if (sensitive)
    same(
      skipped(item, { allowMutations: "true" }),
      true,
      item.name + ": sensitive flag also required",
    );
}
const details = requests.find(
  (item) => item.request.url === "{{baseUrl}}/cert/{{certUUID}}",
);
same(skipped(details, { certUUID: "" }), true, "missing UUID blocks sending");
same(
  skipped(details, { accessToken: "" }),
  true,
  "missing Bearer blocks sending",
);

console.log(
  "API documentation: " +
    checks +
    " checks passed; " +
    requests.length +
    " requests, " +
    coveredRoutes.size +
    " routes, " +
    tableNames.length +
    " tables. No HTTP/DB/ledger writes.",
);
