import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../apps/web/src/lib/diploma-workflow.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const {
  processWorkflowSelection,
  canSelectWorkflowDiploma,
  canEditWorkflowDiploma,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputText).toString("base64")
);
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
const ids = Array.from({ length: 201 }, (_, index) => "fixture-" + index);
const calls = [];
const updates = [];
const results = await processWorkflowSelection(
  "submit",
  [...ids, ids[0]],
  "",
  (completed, total) => updates.push([completed, total]),
  async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    return {
      results: body.diplomaIds.map((uuid) => ({
        uuid,
        success: uuid !== ids[2],
        status: "PENDING",
      })),
    };
  },
);
check("deduplicates selections", results.length === 201);
check(
  "splits large selections into safe API chunks",
  calls.length === 3 &&
    calls[0].body.diplomaIds.length === 100 &&
    calls[2].body.diplomaIds.length === 1,
);
check(
  "sends IDs only instead of editable source data",
  calls.every((call) => Object.keys(call.body).join() === "diplomaIds"),
);
check(
  "reports progress through all chunks",
  updates.at(-1)[0] === 201 && updates.at(-1)[1] === 201,
);
check(
  "preserves per-record failures",
  results.filter((result) => !result.success).length === 1,
);
let rejectionBody;
await processWorkflowSelection(
  "reject",
  [ids[0]],
  "  Source mismatch  ",
  () => {},
  async (_, options) => {
    rejectionBody = JSON.parse(options.body);
    return { results: [{ uuid: ids[0], success: true, status: "REJECTED" }] };
  },
);
check(
  "trims and sends required rejection reason",
  rejectionBody.reason === "Source mismatch",
);
let attempts = 0;
const interrupted = await processWorkflowSelection(
  "approve",
  ids,
  "",
  () => {},
  async () => {
    attempts++;
    throw new Error("Connection interrupted");
  },
);
check(
  "does not automatically retry a possibly committed batch",
  attempts === 1,
);
check(
  "accounts for records not reached after a connection failure",
  interrupted.length === 201 &&
    interrupted
      .slice(100)
      .every((result) => result.error.includes("Chưa thực hiện")),
);
check(
  "requires state refresh after uncertain results",
  interrupted[0].error.includes("tải lại"),
);
const ready = {
  requestType: "DIGITIZATION",
  sourceBatchId: "batch-1",
  requestErrors: [],
  requestedBy: "maker",
};
check(
  "selects only reviewed imported records",
  canSelectWorkflowDiploma(ready, "prepare"),
);
check(
  "excludes incomplete reviewed records",
  !canSelectWorkflowDiploma(
    { ...ready, requestErrors: ["Missing date"] },
    "prepare",
  ),
);
check(
  "excludes drafts with incomplete printed diploma fields",
  !canSelectWorkflowDiploma(
    { ...ready, printWarnings: ["Missing signer"] },
    "prepare",
  ),
);
check(
  "includes newly entered imported records in bulk submission",
  canSelectWorkflowDiploma({ ...ready, requestType: "ISSUANCE" }, "prepare"),
);
check(
  "excludes manual requests without an imported draft",
  !canSelectWorkflowDiploma({ ...ready, sourceBatchId: null }, "prepare"),
);
check(
  "allows incomplete unsigned drafts to be selected for bulk editing",
  canEditWorkflowDiploma({ ...ready, requestErrors: ["Missing date"] }),
);
check(
  "never edits an already signed draft",
  !canEditWorkflowDiploma({ ...ready, pdfSignatureCount: 1 }),
);
check(
  "allows the single officer to approve their own record",
  canSelectWorkflowDiploma(ready, "pending", "maker"),
);
check(
  "allows a different checker",
  canSelectWorkflowDiploma(ready, "pending", "checker"),
);
await assert.rejects(() =>
  processWorkflowSelection("submit", [], "", () => {}),
);
checks++;
console.log("Diploma workflow UI checks passed: " + checks);
