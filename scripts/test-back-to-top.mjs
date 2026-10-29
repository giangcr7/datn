import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createWebLoader } from "./lib/web-component-loader.mjs";

let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const target = new EventTarget();
const calls = [];
let reducedMotion = false;
let passive = false;
let removed = false;
const windowMock = {
  scrollY: 0,
  addEventListener(name, listener, options) {
    passive = options.passive;
    target.addEventListener(name, listener);
  },
  removeEventListener(name, listener) {
    removed = true;
    target.removeEventListener(name, listener);
  },
  matchMedia(query) {
    assert.equal(query, "(prefers-reduced-motion: reduce)");
    return { matches: reducedMotion };
  },
  scrollTo(options) {
    calls.push(options);
  },
};
let state;
let effect;
let cleanup;
const Component = createWebLoader({
  react: {
    ...React,
    useState(initial) {
      state ??= initial;
      return [
        state,
        (value) => {
          state = value;
        },
      ];
    },
    useEffect(callback) {
      effect ??= callback;
    },
  },
})("components/BackToTop.tsx").default;
function scroll(position) {
  windowMock.scrollY = position;
  target.dispatchEvent(new Event("scroll"));
  return Component();
}
try {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock,
  });
  check("no premature button on initial render", Component() === null);
  cleanup = effect();
  check("uses passive scroll listener", passive);
  check("hidden at top", Component() === null);
  check("hidden before scroll threshold", scroll(320) === null);
  const button = scroll(321);
  check("appears after scrolling", button?.type === "button");
  check(
    "accessible icon-only action",
    button.props["aria-label"] === "Lên đầu trang" &&
      button.props.type === "button",
  );
  const html = renderToStaticMarkup(button);
  check(
    "arrow is a decorative SVG, not visible home text",
    html.includes("<svg") &&
      html.includes('aria-hidden="true"') &&
      !html.includes("Về trang chủ") &&
      !html.includes("href="),
  );
  button.props.onClick();
  check(
    "scrolls current page smoothly without navigation",
    calls[0].top === 0 && calls[0].behavior === "smooth",
  );
  reducedMotion = true;
  button.props.onClick();
  check("honors reduced motion preference", calls[1].behavior === "auto");
  check("hides again at top", scroll(0) === null);
  cleanup();
  cleanup = undefined;
  check("unmount removes scroll listener", removed);
  check(
    "unmounted component does not receive scroll events",
    scroll(1000) === null,
  );

  state = undefined;
  effect = undefined;
  Component();
  cleanup = effect();
  check(
    "mounting a scrolled page updates initial visibility",
    Component()?.type === "button",
  );
  const theme = await readFile(
    new URL("../apps/web/src/app/ThemeRegistry.tsx", import.meta.url),
    "utf8",
  );
  check(
    "shared theme mounts button across all routes",
    theme.includes("<BackToTop />"),
  );
  cleanup();
  cleanup = undefined;
  delete globalThis.window;
  const load = createWebLoader();
  const { UniversityFooter } = load("components/UniversityChrome.tsx");
  const footer = renderToStaticMarkup(React.createElement(UniversityFooter));
  check(
    "footer no longer has the old text scroll link",
    !footer.includes('href="#dau-trang"') && !footer.includes("Về đầu trang"),
  );
  check("footer guide remains available", footer.includes("Hướng dẫn sử dụng"));
  const css = await readFile(
    new URL("../apps/web/src/components/BackToTop.module.css", import.meta.url),
    "utf8",
  );
  check(
    "button stays floating and clear of the chat launcher",
    css.includes("position: fixed") &&
      css.includes("bottom: 84px") &&
      css.includes("safe-area-inset-bottom"),
  );
  check(
    "mobile, keyboard focus and reduced motion styles exist",
    css.includes("max-width: 640px") &&
      css.includes(":focus-visible") &&
      css.includes("prefers-reduced-motion"),
  );
} finally {
  cleanup?.();
  if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
  else delete globalThis.window;
}
console.log(
  "Back-to-top checks passed: " +
    checks +
    ". No requests, data writes or temporary files.",
);
