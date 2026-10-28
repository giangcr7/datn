import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const {
  anchorParams,
  anchorStatuses,
  comparisonStatuses,
  networkStatuses,
  eventLabel,
} = await tsImport("../apps/web/src/lib/explorer.ts", {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(
    new URL("../apps/web/tsconfig.json", import.meta.url),
  ),
});
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const filters = {
  search: "  Nguyễn An & 0012  ",
  status: "FAILED",
  eventType: "REVOKE",
};
const params = anchorParams(filters, 2, 50);
for (const [key, value] of Object.entries(filters))
  check("preserves filter " + key, params.get(key) === value.trim());
check(
  "sets server pagination",
  params.get("page") === "2" && params.get("limit") === "50",
);
check(
  "omits empty filters",
  anchorParams({ search: "", status: "", eventType: "" }).toString() ===
    "page=1&limit=20",
);
check(
  "uses business operation names",
  eventLabel("ISSUE") === "Phát hành" && eventLabel("REVOKE") === "Thu hồi",
);
check(
  "distinguishes synchronization from direct reconciliation",
  anchorStatuses.COMMITTED.label === "Đã ghi nhận" &&
    comparisonStatuses.MATCH.label === "Đối chiếu khớp",
);
check(
  "does not mark unavailable Fabric as healthy",
  networkStatuses.UNAVAILABLE.color !== "green" &&
    networkStatuses.DISABLED.color !== "green",
);
check(
  "does not mark unavailable or incomplete evidence as matching",
  comparisonStatuses.UNAVAILABLE.color !== "green" &&
    comparisonStatuses.INCOMPLETE.color !== "green" &&
    comparisonStatuses.PENDING.color !== "green",
);
const source = await readFile(
  new URL(
    "../apps/web/src/app/(admin)/explorer/ExplorerClient.tsx",
    import.meta.url,
  ),
  "utf8",
);
check(
  "removes fictional block and endorsement UI",
  !/CONFIG_GENESIS|Synchronized|VALID<|endorsingMSPs|ĐỘ CAO KHỐI/.test(source),
);
check(
  "does not display proof input or copy proof actions",
  !/proofString|Proof JSON|Sao chép Proof/.test(source),
);
check(
  "explains the scope separately from PDF verification",
  source.includes("không thay thế việc xác thực file PDF"),
);
check("provides exhausted-only filtering", anchorStatuses.EXHAUSTED.label === "Hết lượt thử lại");
check("requires explicit recovery confirmation and reason", source.includes("Xác nhận đưa vào hàng đợi") && source.includes("retryReason.trim().length < 10"));
check("uses a server-issued concurrency token for recovery", source.includes("expectedRetryToken: retryTarget.outbox.retryToken"));
check("shows the original failure history", source.includes("Lịch sử khôi phục gần đây") && source.includes("item.previousAttempts") && source.includes("item.previousError"));
console.log("Blockchain reconciliation UI checks passed: " + checks);
