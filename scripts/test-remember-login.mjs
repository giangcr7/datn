import assert from "node:assert/strict";
import { tsImport } from "tsx/esm/api";

const { readRememberedEmail, saveRememberedEmail, clearRememberedEmail } =
  await tsImport("../apps/web/src/lib/remember-login.ts", import.meta.url);

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  },
};

assert.equal(readRememberedEmail("student"), null);
saveRememberedEmail("student", " student@example.test ");
saveRememberedEmail("university", "staff@example.test");
assert.equal(readRememberedEmail("student"), "student@example.test");
assert.equal(readRememberedEmail("university"), "staff@example.test");
assert.equal(readRememberedEmail("admin"), null);
clearRememberedEmail("student");
assert.equal(readRememberedEmail("student"), null);
assert.equal(readRememberedEmail("university"), "staff@example.test");
assert.deepEqual(
  [...values.keys()],
  ["diplomachain.remembered-email.university"],
);

globalThis.window = {
  get localStorage() {
    throw new Error("Storage unavailable");
  },
};
assert.equal(readRememberedEmail("student"), null);
assert.doesNotThrow(() =>
  saveRememberedEmail("student", "student@example.test"),
);
assert.doesNotThrow(() => clearRememberedEmail("student"));
delete globalThis.window;
assert.equal(readRememberedEmail("student"), null);
assert.doesNotThrow(() =>
  saveRememberedEmail("student", "student@example.test"),
);
assert.doesNotThrow(() => clearRememberedEmail("student"));
console.log("Remembered email checks passed.");
