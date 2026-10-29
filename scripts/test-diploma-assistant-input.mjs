import assert from "node:assert/strict";
import React from "react";
import { createWebLoader } from "./lib/web-component-loader.mjs";

let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
function harness() {
  const slots = [],
    effects = [],
    pending = [];
  let cursor = 0,
    tree;
  let session = { data: null, status: "unauthenticated" };
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
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
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
  const Widget = createWebLoader({
    react: mockedReact,
    "next-auth/react": { useSession: () => session },
  })("components/DiplomaAssistant.tsx").default;
  function render() {
    cursor = 0;
    tree = Widget();
  }
  function find(predicate) {
    function visit(element) {
      if (!React.isValidElement(element)) return;
      if (predicate(element)) return element;
      for (const child of React.Children.toArray([
        element.props.children,
        element.props.extra,
      ])) {
        const result = visit(child);
        if (result) return result;
      }
    }
    const result = visit(tree);
    assert(result, "Expected interactive element");
    return result;
  }
  function text() {
    function collect(element) {
      if (typeof element === "string" || typeof element === "number")
        return String(element);
      if (!React.isValidElement(element)) return "";
      return React.Children.toArray(element.props.children)
        .map(collect)
        .join(" ");
    }
    return collect(tree);
  }
  function flush() {
    while (pending.length) pending.shift()();
    render();
  }
  function submit() {
    let prevented = false;
    const promise = find((element) => element.type === "form").props.onSubmit({
      preventDefault() {
        prevented = true;
      },
    });
    assert(prevented, "Form must not navigate away");
    return promise;
  }
  function key(overrides = {}) {
    let prevented = false;
    const submissions = [];
    find(
      (element) => element.props.id === "diploma-assistant-question",
    ).props.onKeyDown({
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
      nativeEvent: { isComposing: false, keyCode: 13 },
      preventDefault() {
        prevented = true;
      },
      currentTarget: {
        form: {
          requestSubmit() {
            submissions.push(submit());
          },
        },
      },
      ...overrides,
    });
    return { prevented, submissions };
  }
  return {
    render,
    flush,
    find,
    text,
    submit,
    key,
    type(value) {
      find(
        (element) => element.props.id === "diploma-assistant-question",
      ).props.onChange({ target: { value } });
      render();
    },
    session(value) {
      session = value;
      render();
      flush();
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
const savedFetch = globalThis.fetch;
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const requests = [];
const answer = (text = "Hướng dẫn tra cứu") => ({
  success: true,
  mode: "guide",
  answer: text,
  steps: [],
  sources: [],
});
function respond(index, result = answer(), ok = true) {
  requests[index].resolve({ ok, json: async () => result });
}
const widget = harness();
try {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  globalThis.fetch = (url, options) =>
    new Promise((resolve) => {
      requests.push({ url, options, resolve });
    });
  widget.render();
  widget.flush();
  widget
    .find((element) => element.props["aria-label"] === "Mở Trợ lý văn bằng")
    .props.onClick();
  widget.render();
  widget.flush();
  check(
    "launcher opens composer",
    widget.find((element) => element.props.open === true),
  );
  check(
    "requested warning removed",
    !widget
      .text()
      .includes("Không gửi thông tin cá nhân, mật khẩu, OTP hoặc tệp văn bằng"),
  );
  check(
    "privacy explanation retained",
    widget.text().includes("Quyền riêng tư"),
  );
  check(
    "keyboard guidance visible",
    widget.text().includes("Enter để gửi · Shift+Enter để xuống dòng"),
  );
  check(
    "question length stays bounded",
    widget.find((element) => element.props.id === "diploma-assistant-question")
      .props.maxLength === 800,
  );

  for (const value of ["", "  ", "x".repeat(801)]) {
    widget.type(value);
    const attempt = widget.key();
    await Promise.all(attempt.submissions);
    check(
      "empty or overlong question is not submitted: " + value.length,
      attempt.prevented && requests.length === 0,
    );
  }
  widget.type("  Tra cứu cần nhập gì?  ");
  for (const [label, overrides, prevented] of [
    ["regular character", { key: "a" }, false],
    ["Shift+Enter keeps newline", { shiftKey: true }, false],
    ["Ctrl+Enter", { ctrlKey: true }, false],
    ["Alt+Enter", { altKey: true }, false],
    ["Meta+Enter", { metaKey: true }, false],
    [
      "IME composition",
      { nativeEvent: { isComposing: true, keyCode: 13 } },
      false,
    ],
    [
      "legacy IME 229",
      { nativeEvent: { isComposing: false, keyCode: 229 } },
      false,
    ],
    ["held Enter does not repeat", { repeat: true }, true],
  ]) {
    const attempt = widget.key(overrides);
    check(
      label,
      attempt.prevented === prevented &&
        attempt.submissions.length === 0 &&
        requests.length === 0,
    );
  }
  const first = widget.key();
  check(
    "Enter submits once without inserting newline",
    first.prevented && requests.length === 1 && first.submissions.length === 1,
  );
  const duplicate = widget.submit();
  check(
    "in-flight ref blocks duplicate before rerender",
    requests.length === 1,
  );
  await duplicate;
  check(
    "uses same-origin POST and trimmed question",
    requests[0].url === "/api/assistant" &&
      requests[0].options.method === "POST" &&
      JSON.parse(requests[0].options.body).question === "Tra cứu cần nhập gì?",
  );
  widget.render();
  check(
    "input disabled while pending",
    widget.find((element) => element.props.id === "diploma-assistant-question")
      .props.disabled,
  );
  const pendingKey = widget.key();
  check(
    "pending Enter cannot resubmit",
    pendingKey.prevented &&
      pendingKey.submissions.length === 0 &&
      requests.length === 1,
  );
  respond(0);
  await Promise.all(first.submissions);
  widget.render();
  check("answer appears", widget.text().includes("Hướng dẫn tra cứu"));
  check(
    "question cleared on success",
    widget.find((element) => element.props.id === "diploma-assistant-question")
      .props.value === "",
  );
  check(
    "composer unlocked after success",
    !widget.find((element) => element.props.id === "diploma-assistant-question")
      .props.disabled,
  );

  widget.type("Câu hỏi thứ hai");
  check(
    "send button remains a submit button",
    widget.find((element) => element.props.htmlType === "submit").props
      .disabled === false,
  );
  const second = widget.submit();
  check("next button submission works after completion", requests.length === 2);
  widget.render();
  widget
    .find((element) => element.props.children === "Dừng trả lời")
    .props.onClick();
  widget.render();
  check("cancel aborts request", requests[1].options.signal.aborted);
  widget.type("Câu hỏi mới sau khi dừng");
  const third = widget.key();
  check("can send immediately after cancel", requests.length === 3);
  respond(1, answer("Kết quả cũ không được hiển thị"));
  await second;
  widget.render();
  check(
    "stale response ignored",
    !widget.text().includes("Kết quả cũ không được hiển thị"),
  );
  check(
    "stale completion does not unlock active request",
    widget.find((element) => element.props.id === "diploma-assistant-question")
      .props.disabled,
  );
  respond(2, answer("Kết quả mới"));
  await Promise.all(third.submissions);
  widget.render();
  check("new response retained", widget.text().includes("Kết quả mới"));

  widget.type("Thử kết nối lại");
  const failure = widget.key();
  respond(3, { success: false, error: "Không thể kết nối trợ lý" }, false);
  await Promise.all(failure.submissions);
  widget.render();
  check(
    "failure is visible and retains question",
    widget.text().includes("Không thể kết nối trợ lý") &&
      widget.find(
        (element) => element.props.id === "diploma-assistant-question",
      ).props.value === "Thử kết nối lại",
  );
  const retry = widget.key();
  check("Enter retries after failure", requests.length === 5);
  respond(4);
  await Promise.all(retry.submissions);
  widget.render();

  widget.type("Câu hỏi cần hủy khi xóa chat");
  const reset = widget.key();
  widget.render();
  widget
    .find((element) => element.props["aria-label"] === "Xóa nội dung chat")
    .props.onClick();
  widget.render();
  check(
    "reset aborts and clears conversation",
    requests[5].options.signal.aborted &&
      !widget.text().includes("Hướng dẫn tra cứu") &&
      widget.find(
        (element) => element.props.id === "diploma-assistant-question",
      ).props.value === "",
  );
  respond(5);
  await Promise.all(reset.submissions);
  widget.render();
  check(
    "reset conversation stays empty after stale response",
    !widget.text().includes("Hướng dẫn tra cứu"),
  );

  widget.type("Câu hỏi trước khi đổi tài khoản");
  const previousIdentity = widget.key();
  widget.render();
  widget.session({
    data: { user: { id: "student-id", role: "student" } },
    status: "authenticated",
  });
  check(
    "identity change aborts and clears question",
    requests[6].options.signal.aborted &&
      widget.find(
        (element) => element.props.id === "diploma-assistant-question",
      ).props.value === "",
  );
  respond(6);
  await Promise.all(previousIdentity.submissions);
  widget.render();
  widget.type("Câu hỏi sau khi đổi tài khoản");
  const finalRequest = widget.key();
  check(
    "aborted identity request does not block new send",
    requests.length === 8,
  );
  widget.unmount();
  check("unmount cancels active request", requests[7].options.signal.aborted);
  respond(7);
  await Promise.all(finalRequest.submissions);
} finally {
  widget.unmount();
  for (const request of requests)
    request.resolve({ ok: false, json: async () => ({ success: false }) });
  globalThis.fetch = savedFetch;
  if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
  else delete globalThis.window;
}
console.log(
  "Diploma assistant input checks passed: " +
    checks +
    ". No external requests, database writes or temporary files.",
);
