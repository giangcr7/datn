import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createWebLoader } from "./lib/web-component-loader.mjs";

let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
const load = createWebLoader();
const { registryComparisonValue, registryDuplicateStatus } = load(
  "lib/registry-duplicates.ts",
);
const { canEditRegistryRow, registryIssueText } = load(
  "lib/registry-review.ts",
);
check(
  "preserves leading zeros",
  registryComparisonValue({ studentCode: "0012345678" }, "studentCode") ===
    "0012345678",
);
check(
  "Vietnamese dates",
  registryComparisonValue({ dateOfBirth: "2002-01-02" }, "dateOfBirth") ===
    "02/01/2002",
);
check(
  "does not invent invalid dates",
  registryComparisonValue({ dateOfBirth: "unknown" }, "dateOfBirth") ===
    "unknown",
);
check(
  "empty value",
  registryComparisonValue({ certificateNo: null }, "certificateNo") ===
    "Chưa có",
);
check(
  "classification label",
  registryComparisonValue({ classification: "GOOD" }, "classification") ===
    "Khá",
);
check(
  "superseded label",
  registryDuplicateStatus("SUPERSEDED") === "Đã thay thế",
);
check("rejected label", registryDuplicateStatus("REJECTED") === "Đã từ chối");
check(
  "legacy warnings identify field",
  registryIssueText({
    code: "REPEATED_STUDENT_CODE",
    field: "studentCode",
    message: "Trùng với 2025!1333",
  }).startsWith("Mã sinh viên: "),
);
check("staging rows editable", canEditRegistryRow({ status: "NEEDS_REVIEW" }));
check("skipped rows read-only", !canEditRegistryRow({ status: "SKIPPED" }));
check(
  "graduation-only imported rows read-only",
  !canEditRegistryRow({ status: "IMPORTED" }),
);
for (const diploma of [
  { status: "ACTIVE", workflowStatus: "APPROVED", pdfSignatureCount: 1 },
  { status: "DRAFT", workflowStatus: "DRAFT", pdfSignatureCount: 1 },
  { status: "DRAFT", workflowStatus: "REQUESTED", pdfSignatureCount: 0 },
])
  check(
    "protected imported record read-only",
    !canEditRegistryRow({
      status: "IMPORTED",
      graduation: { diplomas: [diploma] },
    }),
  );
check(
  "unsigned imported draft editable",
  canEditRegistryRow({
    status: "IMPORTED",
    graduation: {
      diplomas: [
        { status: "DRAFT", workflowStatus: "DRAFT", pdfSignatureCount: 0 },
      ],
    },
  }),
);

const values = {
  studentCode: "0012345678",
  fullName: "Nguyễn An",
  dateOfBirth: "2002-01-02",
  classCode: "C01",
  programOriginal: "Kỹ thuật xây dựng",
  graduationYear: 2024,
  classification: "GOOD",
  certificateNo: "000123",
  registryNo: "R/001",
};
const report = {
  current: {
    id: "current",
    fileName: "source.xlsx",
    sheetName: "2025",
    rowNumber: 1208,
    status: "NEEDS_REVIEW",
    values,
  },
  matches: [
    {
      key: "row:peer",
      kind: "row",
      id: "peer",
      sheetName: "2025",
      rowNumber: 1333,
      status: "NEEDS_REVIEW",
      values: {
        ...values,
        fullName: "<img src=x onerror=alert(1)>",
        classCode: "C02",
      },
      matchedFields: ["studentCode", "certificateNo"],
    },
    {
      key: "diploma:stored",
      kind: "diploma",
      id: "stored",
      status: "ACTIVE",
      workflowStatus: "APPROVED",
      values: { ...values, certificateNo: "C/001?x=1" },
      matchedFields: ["registryNo"],
    },
  ],
  total: 12,
  page: 1,
  limit: 5,
  restrictedCount: 1,
  fields: [
    {
      field: "studentCode",
      label: "Mã sinh viên",
      value: values.studentCode,
      count: 1,
      restricted: false,
    },
    {
      field: "certificateNo",
      label: "Số hiệu văn bằng",
      value: values.certificateNo,
      count: 1,
      restricted: true,
    },
  ],
};
function harness(initialProps = {}) {
  const slots = [],
    effects = [],
    pending = [];
  let cursor = 0;
  let props = {
    batchId: "batch",
    rowId: "current",
    revision: 0,
    dirty: false,
    onOpenRow() {},
    ...initialProps,
  };
  const mockedReact = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = effects[index];
      if (
        !previous ||
        dependencies.some(
          (value, item) => value !== previous.dependencies[item],
        )
      ) {
        effects[index] = { dependencies, cleanup: previous?.cleanup };
        pending.push(() => {
          effects[index].cleanup?.();
          effects[index].cleanup = callback();
        });
      }
    },
  };
  const Panel = createWebLoader({ react: mockedReact })(
    "components/RegistryDuplicatePanel.tsx",
  ).default;
  let tree;
  return {
    render(changes = {}) {
      props = { ...props, ...changes };
      cursor = 0;
      tree = Panel(props);
      return renderToStaticMarkup(tree);
    },
    async flush() {
      while (pending.length) pending.shift()();
      await new Promise((resolve) => setImmediate(resolve));
      return this.render();
    },
    find(predicate) {
      function visit(element) {
        if (!React.isValidElement(element)) return;
        if (predicate(element)) return element;
        for (const child of React.Children.toArray([
          element.props.children,
          element.props.action,
        ])) {
          const found = visit(child);
          if (found) return found;
        }
      }
      const found = visit(tree);
      assert(found, "Expected interactive element");
      return found;
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
const originalFetch = globalThis.fetch;
const panels = [];
const requests = [];
try {
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(report));
  };
  let opened;
  const panel = harness({
    onOpenRow: (id) => {
      opened = id;
    },
  });
  panels.push(panel);
  check(
    "initial loading state",
    panel.render().includes("Đang tìm hồ sơ trùng"),
  );
  let html = await panel.flush();
  check(
    "source filename and current row",
    html.includes("source.xlsx") && html.includes("1208"),
  );
  check("shows related source row", html.includes("1333"));
  check(
    "comparison table with column and row headers",
    html.includes("<table") &&
      html.includes('scope="col"') &&
      html.includes('scope="row"'),
  );
  check(
    "duplicate and differing fields distinguished in text",
    html.includes("Gây trùng") && html.includes("Khác nhau"),
  );
  check(
    "MSSV warning differs from number blocker",
    html.includes("một người có thể có nhiều văn") &&
      html.includes("phải xử lý trước khi lưu"),
  );
  check(
    "restricted details not exposed",
    html.includes("ngoài phạm vi cơ sở") && !html.includes("restricted-id"),
  );
  check(
    "escapes stored text rather than interpreting markup",
    html.includes("&lt;img") && !html.includes("<img src=x"),
  );
  check("date display in comparison", html.includes("02/01/2002"));
  panel
    .find(
      (element) =>
        typeof element.props.onClick === "function" &&
        String(element.props.children).includes("Mở dòng"),
    )
    .props.onClick();
  check("opens exact related import row", opened === "peer");
  panel
    .find((element) => element.props.id === "registry-duplicate-selection")
    .props.onChange("diploma:stored");
  html = panel.render({ dirty: true });
  check(
    "unsaved corrections clearly indicated",
    html.includes("thay đổi chưa lưu"),
  );
  const link = panel.find((element) =>
    element.props.href?.startsWith("/certificates?search="),
  );
  check(
    "encoded diploma-register link",
    link.props.href === "/certificates?search=C%2F001%3Fx%3D1" &&
      link.props.rel === "noopener noreferrer",
  );
  panel
    .find(
      (element) =>
        element.props.pageSize === 5 &&
        typeof element.props.onChange === "function",
    )
    .props.onChange(2);
  panel.render();
  await panel.flush();
  check(
    "fetches selected comparison page",
    requests.at(-1).url.endsWith("?page=2&limit=5"),
  );
  panel.render({ revision: 1 });
  await panel.flush();
  check("refetches after a saved review", requests.length === 3);
  check(
    "read-only request never forwards record values",
    requests.every(
      ({ url, options }) =>
        !options.body &&
        options.cache === "no-store" &&
        !url.includes("Nguyễn") &&
        !url.includes(values.studentCode),
    ),
  );
  panel.unmount();
  check(
    "aborts request on closing row",
    requests.at(-1).options.signal.aborted,
  );

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ...report,
        total: 0,
        matches: [],
        fields: [],
        restrictedCount: 0,
      }),
    );
  const empty = harness();
  panels.push(empty);
  empty.render();
  html = await empty.flush();
  check(
    "empty match does not claim diploma eligibility",
    html.includes("Đây không phải kết luận hồ sơ đã đủ điều kiện") &&
      !html.includes("<table"),
  );

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Không tải được hồ sơ đối chiếu." }), {
      status: 503,
    });
  const failed = harness();
  panels.push(failed);
  failed.render();
  html = await failed.flush();
  check(
    "failure explains retry without claiming no duplicates",
    html.includes("Chưa thể đối chiếu") &&
      html.includes("Thử lại") &&
      !html.includes("Không phát hiện trùng"),
  );
  globalThis.fetch = async () => new Response(JSON.stringify(report));
  failed
    .find((element) => typeof element.props.onClick === "function")
    .props.onClick();
  failed.render();
  check(
    "retry retrieves comparison",
    (await failed.flush()).includes("<table"),
  );

  let resolveOld;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      resolveOld = resolve;
    });
  const stale = harness();
  panels.push(stale);
  stale.render();
  await stale.flush();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ...report,
        current: { ...report.current, rowNumber: 9999 },
      }),
    );
  stale.render({ rowId: "new-row" });
  await stale.flush();
  resolveOld(new Response(JSON.stringify(report)));
  await new Promise((resolve) => setImmediate(resolve));
  html = stale.render();
  check(
    "late response cannot overwrite newly opened row",
    html.includes("9999") && !html.includes(">1208<"),
  );

  const source = await readFile(
    new URL(
      "../apps/web/src/app/(admin)/import/ImportClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  check(
    "comparison wired into review modal",
    source.includes("<RegistryDuplicatePanel") &&
      source.includes("onOpenRow={openRelatedRow}"),
  );
  check(
    "switching related row confirms unsaved changes",
    source.includes("if (dirtyReview)") &&
      source.includes("Bỏ thay đổi và chuyển"),
  );
  check(
    "related row fetch ignores list status filter",
    source.includes('"/rows?rowId="') && source.includes('"&limit=1"'),
  );
  check(
    "failed review refreshes displayed issues",
    source.includes("issues: result.issues") &&
      source.includes("setDuplicateRevision"),
  );
  check(
    "readonly comparison uses disabled editing controls",
    source.includes("componentDisabled={busy || readOnlyReview}"),
  );
} finally {
  for (const panel of panels) panel.unmount();
  globalThis.fetch = originalFetch;
}
console.log(
  "PASS: " +
    checks +
    " registry duplicate UI, interaction and request checks; no database writes or output files.",
);
