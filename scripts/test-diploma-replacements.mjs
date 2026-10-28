import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function module(path) {
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  new Function('exports', code)(exports);
  return exports;
}
const { getDiplomaActions } = module('../apps/web/src/lib/workspace-access.ts');
const {
  replacementStages,
  replacementEventLabels,
  replacementComparisonFields,
} = module('../apps/web/src/lib/diploma-replacements.ts');
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
const officer = {
  role: 'university',
  isHeadquarters: true,
  canApproveDiplomas: true,
};
const issued = { status: 'ON_CHAIN', documentStatus: 'ACTIVE' };
check(
  'officer can replace an issued active diploma',
  getDiplomaActions(officer, issued).replace,
);
for (const actor of [
  { role: 'admin' },
  { role: 'student' },
  { ...officer, canApproveDiplomas: false },
  { ...officer, isHeadquarters: false },
])
  check(
    'non-approvers cannot replace',
    !getDiplomaActions(actor, issued).replace,
  );
for (const status of [
  'DRAFT',
  'PENDING',
  'ANCHOR_PENDING',
  'REPLACED',
  'REVOKED',
])
  check(
    'only issued active certificates may be replaced: ' + status,
    !getDiplomaActions(officer, { ...issued, status }).replace,
  );
check(
  'an existing replacement suppresses duplicate creation and independent revocation',
  !getDiplomaActions(officer, { ...issued, replacement: { uuid: 'child' } })
    .replace &&
    !getDiplomaActions(officer, { ...issued, replacement: { uuid: 'child' } })
      .revoke,
);
check(
  'all four lifecycle stages have business labels',
  replacementStages.length === 4 &&
    replacementStages.every((stage) => stage.label && stage.value),
);
check(
  'comparison covers identity, results and identifiers',
  [
    'fullName',
    'dob',
    'major',
    'gpa',
    'grade',
    'soHieu',
    'soVaoSo',
    'issueDate',
  ].every((field) =>
    replacementComparisonFields.some(([key]) => key === field),
  ),
);
check(
  'history has replacement and invalidation labels',
  [
    'CREATE_REPLACEMENT',
    'EDIT_REPLACEMENT',
    'SUBMIT_REPLACEMENT',
    'REOPEN_REPLACEMENT',
    'REJECT_REPLACEMENT',
    'SUPERSEDED',
  ].every((event) => replacementEventLabels[event]),
);
console.log('Replacement workflow/policy checks passed: ' + checks + '.');
