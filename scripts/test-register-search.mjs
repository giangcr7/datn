import assert from "node:assert/strict";
import React from "react";
import { createWebLoader } from "./lib/web-component-loader.mjs";

let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
let session;
let failure;
const calls = [];
const load = createWebLoader({
  "next-auth": { getServerSession: async () => session },
  "@/lib/auth-options": { authOptions: {} },
  "@/lib/api": {
    apiCall: async (...args) => {
      calls.push(args);
      if (failure) throw failure;
      return { data: [] };
    },
  },
});
const route = load("app/api/certificates/suggestions/route.ts");
const helpers = load("lib/diploma-register.ts");
const suggestion = (index = 0) => ({
  uuid: "fixture-" + index,
  fullName: "Đặng Thị Ánh " + index,
  mssv: "00123" + index,
  soHieu: "VB-" + index,
  soVaoSo: "VS-" + index,
  major: "Công nghệ thông tin",
  namTotNghiep: "2024",
  status: "ON_CHAIN",
  matchKind: "EXACT_CODE",
});
const request = () =>
  new Request(
    "http://localhost/api/certificates/suggestions?search=dang&year=2024&limit=100&page=90",
  );
check(
  "accepts only valid lightweight suggestion payloads",
  helpers.isRegisterSuggestion(suggestion()) &&
    !helpers.isRegisterSuggestion({ ...suggestion(), status: "DRAFT" }) &&
    !helpers.isRegisterSuggestion({ ...suggestion(), namTotNghiep: 2024 }) &&
    !helpers.isRegisterSuggestion(null),
);
for (const [user, token, status] of [
  [null, undefined, 401],
  [{ role: "student" }, "fixture", 403],
  [
    { role: "university", isHeadquarters: false, canApproveDiplomas: true },
    "fixture",
    403,
  ],
  [
    { role: "university", isHeadquarters: true, canApproveDiplomas: false },
    "fixture",
    403,
  ],
]) {
  session = { user, accessToken: token };
  const response = await route.GET(request());
  check(
    "proxy denies unauthorized users without forwarding",
    response.status === status && calls.length === 0,
  );
  check(
    "denied suggestions are never cached",
    response.headers.get("cache-control") === "private, no-store",
  );
}
for (const role of ["admin", "university"]) {
  session = {
    user: { role, isHeadquarters: true, canApproveDiplomas: true },
    accessToken: "in-memory-token",
  };
  const response = await route.GET(request());
  const [url, method, body, token] = calls.at(-1);
  const params = new URL(url, "http://localhost").searchParams;
  check(
    "proxy bounds requests and preserves filters for " + role,
    response.ok &&
      params.get("page") === "1" &&
      params.get("limit") === "6" &&
      params.get("year") === "2024" &&
      method === "GET" &&
      body === undefined &&
      token === "in-memory-token",
  );
  check(
    "successful suggestions are private and uncached",
    response.headers.get("cache-control") === "private, no-store",
  );
}
failure = Object.assign(new Error("Too many requests"), { status: 429 });
check(
  "proxy preserves throttling HTTP status",
  (await route.GET(request())).status === 429,
);

function harness() {
  const slots = [],
    effects = [],
    pending = [],
    submissions = [];
  let cursor = 0,
    tree;
  let props = {
    id: "quick-search",
    filters: helpers.emptyRegisterFilters(),
    disabled: false,
    onChange: (value) => {
      props = { ...props, filters: { ...props.filters, search: value } };
    },
    onSubmit: (value) => submissions.push(value),
  };
  const component = createWebLoader({
    antd: { Input: "mock-input", Spin: "mock-spin" },
    "@ant-design/icons": { SearchOutlined: "mock-icon" },
    react: {
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
        const index = cursor++,
          previous = effects[index];
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
    },
  })("components/RegisterQuickSearch.tsx").default;
  function render() {
    cursor = 0;
    tree = component(props);
    while (pending.length) pending.shift()();
    cursor = 0;
    tree = component(props);
  }
  function findAll(predicate) {
    const found = [];
    function visit(element) {
      if (!React.isValidElement(element)) return;
      if (predicate(element)) found.push(element);
      React.Children.toArray(element.props.children).forEach(visit);
    }
    visit(tree);
    return found;
  }
  function input() {
    return findAll((element) => element.type === "mock-input")[0];
  }
  return {
    render,
    input,
    submissions,
    options: () => findAll((element) => element.props.role === "option"),
    type(value) {
      input().props.onChange({ target: { value } });
      render();
    },
    filter(value) {
      props = { ...props, filters: { ...props.filters, ...value } };
      render();
    },
    disabled(value) {
      props = { ...props, disabled: value };
      render();
    },
    key(key, isComposing = false) {
      let prevented = false;
      input().props.onKeyDown({
        key,
        nativeEvent: { isComposing },
        preventDefault() {
          prevented = true;
        },
        stopPropagation() {},
      });
      render();
      return prevented;
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
const originalFetch = globalThis.fetch,
  originalTimeout = globalThis.setTimeout,
  originalClear = globalThis.clearTimeout;
const timers = new Map(),
  requests = [];
let timerId = 0;
const widget = harness();
function tick() {
  const callbacks = [...timers.values()];
  timers.clear();
  return Promise.all(callbacks.map(({ callback }) => callback()));
}
function respond(index, data = [suggestion()], ok = true) {
  requests[index].resolve({ ok, json: async () => ({ success: ok, data }) });
}
try {
  globalThis.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.fetch = (url, options) =>
    new Promise((resolve) => requests.push({ url, options, resolve }));
  widget.render();
  widget.type("a");
  check(
    "does not fetch for a single character",
    timers.size === 0 && requests.length === 0,
  );
  widget.type("dang");
  check(
    "debounces suggestions for 300ms",
    timers.size === 1 &&
      [...timers.values()][0].delay === 300 &&
      requests.length === 0,
  );
  widget.type("dang thi");
  check("typing replaces rather than stacks pending timers", timers.size === 1);
  let pending = tick();
  check(
    "fetch is uncached and cancellable",
    requests.length === 1 &&
      requests[0].options.cache === "no-store" &&
      requests[0].options.signal,
  );
  widget.type("dang anh");
  check(
    "new query aborts previous request",
    requests[0].options.signal.aborted,
  );
  respond(0, [suggestion(99)]);
  await pending;
  widget.render();
  check(
    "late response cannot overwrite current suggestions",
    widget.options().length === 0,
  );
  pending = tick();
  respond(1, [
    ...Array.from({ length: 8 }, (_, index) => suggestion(index)),
    { status: "DRAFT" },
  ]);
  await pending;
  widget.render();
  check(
    "renders at most six suggestions and correct combobox semantics",
    widget.options().length === 6 &&
      widget.input().props["aria-expanded"] === true &&
      widget.input().props["aria-autocomplete"] === "list",
  );
  widget.key("ArrowDown");
  check(
    "arrow keys select an accessible active option",
    widget.input().props["aria-activedescendant"] ===
      "quick-search-suggestions-0",
  );
  check(
    "IME Enter does not submit",
    !widget.key("Enter", true) && widget.submissions.length === 0,
  );
  widget.key("Enter");
  check(
    "Enter selects a suggestion by exact code and closes list",
    widget.submissions[0] === "VB-0" &&
      widget.input().props["aria-expanded"] === false,
  );
  widget.type("cau hoi moi");
  widget.key("Enter");
  check(
    "Enter without an active suggestion submits the full query",
    widget.submissions.at(-1) === "cau hoi moi" && timers.size === 0,
  );
  widget.type("dang");
  pending = tick();
  widget.filter({ year: "2023", status: "REVOKED" });
  check(
    "filter changes abort previous suggestions and clear results",
    requests[2].options.signal.aborted && widget.options().length === 0,
  );
  respond(2);
  await pending;
  pending = tick();
  check(
    "suggestions inherit selected filters",
    requests[3].url.includes("year=2023") &&
      requests[3].url.includes("status=REVOKED"),
  );
  respond(3, [], false);
  await pending;
  widget.render();
  widget.key("Enter");
  check(
    "a suggestion error does not block full search",
    widget.submissions.at(-1) === "dang",
  );
  widget.type("nguyen");
  pending = tick();
  widget.key("Escape");
  check(
    "Escape closes and aborts suggestions",
    requests[4].options.signal.aborted &&
      widget.input().props["aria-expanded"] === false,
  );
  respond(4);
  await pending;
  widget.type("nguyen van");
  widget.disabled(true);
  check(
    "disabled control cancels debounce and hides suggestions",
    timers.size === 0 && widget.input().props["aria-expanded"] === false,
  );
  widget.disabled(false);
  pending = tick();
  widget.unmount();
  check("unmount aborts active request", requests[5].options.signal.aborted);
  respond(5);
  await pending;
} finally {
  widget.unmount();
  for (const request of requests)
    request.resolve({ ok: false, json: async () => ({ success: false }) });
  timers.clear();
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClear;
}
console.log(
  "Register quick-search checks passed: " +
    checks +
    ". No external requests or stored fixtures.",
);
