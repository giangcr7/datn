import assert from "node:assert/strict";
import React from "react";
import { createWebLoader } from "./lib/web-component-loader.mjs";

let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const values = {
  currentPassword: "current-fixture-password",
  newPassword: "new-fixture-password",
  confirmPassword: "new-fixture-password",
};
function harness(role) {
  const state = [];
  const events = [];
  const timers = [];
  let cursor = 0;
  let session = role ? { user: { role } } : null;
  const Form = Object.assign(() => null, { Item: () => null });
  const page = createWebLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [
          state[index],
          (value) => {
            state[index] = value;
          },
        ];
      },
    },
    antd: {
      Form,
      Input: { Password: () => null },
      Button: () => null,
      Alert: () => null,
    },
    "next/navigation": {
      useRouter: () => ({ push: (url) => events.push(["navigate", url]) }),
    },
    "next-auth/react": {
      useSession: () => ({ data: session }),
      signOut: async (options) => {
        events.push(["signOut", options]);
        session = null;
      },
    },
  })("app/(public)/change-password/page.tsx").default;
  function render() {
    cursor = 0;
    const content = page();
    return content.type(content.props);
  }
  function find(element, predicate) {
    if (!React.isValidElement(element)) return;
    if (predicate(element)) return element;
    for (const child of React.Children.toArray(element.props.children)) {
      const result = find(child, predicate);
      if (result) return result;
    }
  }
  globalThis.setTimeout = (callback, milliseconds) => {
    timers.push({ callback, milliseconds });
    return 0;
  };
  return {
    events,
    timers,
    state,
    submit: (input = values) =>
      find(render(), (element) => element.type === Form).props.onFinish(input),
  };
}
try {
  for (const [role, expected] of [
    ["university", "/login?type=university&msg=changed"],
    ["admin", "/login?type=admin&msg=changed"],
    ["student", "/login?type=student&msg=changed"],
    [undefined, "/login?msg=changed"],
    ["https://untrusted.example", "/login?msg=changed"],
  ]) {
    const test = harness(role);
    const requests = [];
    globalThis.fetch = async (...arguments_) => {
      requests.push(arguments_);
      return { json: async () => ({ success: true }) };
    };
    await test.submit();
    check(
      "password change posts only expected credentials",
      requests.length === 1 &&
        requests[0][0] === "/api/auth/change-password" &&
        requests[0][1].method === "POST" &&
        JSON.stringify(JSON.parse(requests[0][1].body)) ===
          JSON.stringify({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          }),
    );
    check(
      "success message appears before leaving",
      test.state[2] === true && test.state[0] === false,
    );
    check(
      "redirect waits for the success message",
      test.events.length === 0 &&
        test.timers.length === 1 &&
        test.timers[0].milliseconds === 1500,
    );
    await test.timers[0].callback();
    check(
      "session is revoked before navigation",
      JSON.stringify(test.events[0]) ===
        JSON.stringify(["signOut", { redirect: false }]),
    );
    check(
      "return portal retains the original role after signOut",
      test.events.length === 2 &&
        test.events[1][0] === "navigate" &&
        test.events[1][1] === expected,
    );
  }
  for (const failure of ["mismatch", "rejected", "network"]) {
    const test = harness("admin");
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      if (failure === "network") throw new Error("Fixture network failure");
      return {
        json: async () => ({
          success: false,
          error: "Rejected fixture password",
        }),
      };
    };
    await test.submit(
      failure === "mismatch"
        ? { ...values, confirmPassword: "different" }
        : values,
    );
    check(
      "failed password change does not sign out or navigate",
      test.events.length === 0 && test.timers.length === 0,
    );
    check(
      "failure is visible without leaving the form busy",
      !!test.state[1] && test.state[0] === false && test.state[2] === false,
    );
    check(
      "mismatched confirmation is rejected before the API",
      requests === (failure === "mismatch" ? 0 : 1),
    );
  }
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
}
console.log(
  "Password-change redirect checks passed: " +
    checks +
    ". Role portals, logout ordering and failure paths checked without changing any account.",
);
