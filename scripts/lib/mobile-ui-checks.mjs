import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runMobileUiChecks({ base, temporary, routes, check }) {
  const previews = process.env.WORKDESK_TEST_PREVIEW_DIR
    ? await realpath(process.env.WORKDESK_TEST_PREVIEW_DIR)
    : null;
  if (previews) {
    const owned = relative(resolve(tmpdir()), previews);
    assert(owned && !owned.startsWith("..") && !isAbsolute(owned));
  }
  const { chromium } = await import(
    pathToFileURL(resolve(process.env.WORKDESK_BROWSER_MODULE))
  );
  const context = await chromium.launchPersistentContext(
    join(temporary, "browser-profile"),
    {
      headless: true,
      executablePath: process.env.WORKDESK_BROWSER_EXECUTABLE,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: "vi-VN",
      reducedMotion: "reduce",
    },
  );
  try {
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin === base)
        await route.continue();
      else await route.abort();
    });
    async function go(route, session) {
      await context.clearCookies();
      if (session)
        await context.addCookies([
          {
            name: "next-auth.session-token",
            value: session.slice(session.indexOf("=") + 1),
            url: base,
          },
        ]);
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.fonts.status === "loaded");
      const heading = page.getByRole("heading", { level: 1 });
      await heading.waitFor({ state: "visible" });
      check(
        "one hydrated page heading: " + route,
        (await heading.count()) === 1,
      );
    }
    async function fits(label) {
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll("main *, header *")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width && rect.right > innerWidth + 1;
          })
          .slice(0, 6)
          .map((element) => element.className),
      }));
      check(
        label + ": " + JSON.stringify(dimensions),
        dimensions.scroll <= dimensions.width + 1,
      );
    }
    async function settleAnimations() {
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    }
    async function dialogFits(label) {
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      await settleAnimations();
      await page.waitForFunction(() => {
        const rect = document
          .querySelector('[role="dialog"]')
          .getBoundingClientRect();
        return rect.left >= -1 && rect.right <= innerWidth + 1;
      });
      const dimensions = await dialog.evaluate((element) => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      check(label, dimensions.scroll <= dimensions.width + 1);
      return dialog;
    }
    async function closeDialog() {
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    async function preview(name) {
      if (!previews) return;
      await settleAnimations();
      await page.screenshot({
        path: join(previews, name + ".png"),
        fullPage: false,
      });
    }
    for (const [route, session] of routes) {
      await go(route, session);
      for (const width of [320, 390, 768, 991, 992, 1280]) {
        await page.setViewportSize({
          width,
          height: width >= 768 ? 1024 : 844,
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await fits("no page overflow at " + width + "px: " + route);
        const toggle = page.getByRole("button", {
          name: /^Mở menu (chính|quản lý|sinh viên)$/,
        });
        check(
          "mobile navigation breakpoint: " + width + "px " + route,
          (await toggle.isVisible()) === width < 992,
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await go("/", null);
    const publicToggle = page.getByRole("button", { name: "Mở menu chính" });
    await publicToggle.click();
    let dialog = await dialogFits("public drawer fits mobile viewport");
    check(
      "public drawer exposes all destinations",
      (await dialog.getByRole("link").count()) === 5,
    );
    await preview("mobile-public-menu");
    await closeDialog();
    check(
      "closing drawer restores focus",
      await publicToggle.evaluate(
        (element) => element === document.activeElement,
      ),
    );
    await publicToggle.click();
    await dialogFits("public menu opens for mask dismissal");
    check(
      "drawer locks background scrolling",
      await page.evaluate(
        () => getComputedStyle(document.body).overflowY === "hidden",
      ),
    );
    await page.mouse.click(385, 100);
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      "tapping outside closes mobile navigation",
      (await publicToggle.getAttribute("aria-expanded")) === "false",
    );
    await publicToggle.click();
    dialog = await dialogFits("public menu opens again");
    await dialog
      .getByRole("link", { name: "Tra cứu văn bằng", exact: true })
      .click();
    await page.waitForURL(base + "/search");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      "menu closes after navigation",
      (await publicToggle.getAttribute("aria-expanded")) === "false",
    );
    await preview("mobile-search");
    await go("/login", null);
    check(
      "all three login roles remain visible",
      (await page.getByRole("tab").count()) === 3,
    );
    for (const tab of await page.getByRole("tab").all()) {
      const rect = await tab.boundingBox();
      check(
        "login role tab fits",
        rect && rect.x >= 0 && rect.x + rect.width <= 391,
      );
    }
    check(
      "mobile inputs avoid iOS text zoom",
      await page
        .locator("input.ant-input")
        .first()
        .evaluate(
          (element) => parseFloat(getComputedStyle(element).fontSize) >= 16,
        ),
    );
    await preview("mobile-login");
    const officer = routes.find(([route]) => route === "/dashboard")[1];
    await go("/dashboard", officer);
    await page
      .getByRole("button", { name: "Mở menu quản lý", exact: true })
      .click();
    dialog = await dialogFits("staff drawer fits mobile viewport");
    check(
      "staff menu retains issuance workflow",
      await dialog
        .getByRole("menuitem", { name: /Kiểm tra dữ liệu/ })
        .isVisible(),
    );
    await preview("mobile-staff-menu");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      "desktop resize closes mobile drawer",
      await page
        .getByRole("button", { name: "Thu gọn menu", exact: true })
        .isVisible(),
    );
    await page
      .getByRole("button", { name: "Thu gọn menu", exact: true })
      .click();
    check(
      "desktop sidebar still collapses",
      (await page
        .getByRole("button", { name: "Mở menu", exact: true })
        .getAttribute("aria-expanded")) === "false",
    );
    await page.getByRole("button", { name: "Mở menu", exact: true }).click();
    await preview("desktop-dashboard");
    await page.setViewportSize({ width: 320, height: 740 });
    await go("/catalog", officer);
    const table = page.locator(".ant-table-content").first();
    check(
      "wide tables scroll inside their container",
      await table.evaluate(
        (element) =>
          element.scrollWidth > element.clientWidth &&
          getComputedStyle(element).overflowX === "auto",
      ),
    );
    await table.evaluate((element) => {
      element.scrollLeft = 100;
    });
    check(
      "horizontal table scrolling works",
      await table.evaluate((element) => element.scrollLeft > 0),
    );
    await page.getByRole("button", { name: /Thêm ngành$/ }).click();
    await dialogFits("catalog modal fits 320px viewport");
    await preview("mobile-catalog-modal");
    await closeDialog();
    await page
      .getByRole("button", { name: "Thông báo công việc", exact: true })
      .click();
    await dialogFits("notification drawer fits 320px viewport");
    await closeDialog();
    await page
      .getByRole("button", { name: "Mở Trợ lý văn bằng", exact: true })
      .click();
    dialog = await dialogFits("assistant fits 320px viewport");
    const question = dialog.getByRole("textbox");
    check(
      "mobile keyboard offers send action",
      (await question.getAttribute("enterkeyhint")) === "send",
    );
    await question.fill("Tra cứu cần nhập những gì?");
    await question.press("Enter");
    await dialog
      .getByRole("log")
      .getByText("Tra cứu cần nhập những gì?", { exact: true })
      .waitFor();
    check(
      "Enter submits assistant question",
      (await question.inputValue()) === "",
    );
    await page.waitForFunction(
      () => !document.querySelector(".ant-btn-loading"),
    );
    await preview("mobile-assistant");
    await closeDialog();
    const student = routes.find(([route]) => route === "/student/dashboard")[1];
    await go("/student/dashboard", student);
    await page
      .getByRole("button", { name: "Mở menu sinh viên", exact: true })
      .click();
    dialog = await dialogFits("student drawer fits 320px viewport");
    check(
      "student keeps logout in mobile menu",
      await dialog.getByRole("menuitem", { name: /Đăng xuất/ }).isVisible(),
    );
    await dialog.getByRole("menuitem", { name: /Hồ sơ của tôi/ }).click();
    await page.waitForURL(base + "/student/profile");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await fits("student profile fits after mobile navigation");
    check("no browser runtime exceptions", failures.length === 0);
  } catch (error) {
    if (previews)
      await context
        .pages()
        .at(-1)
        ?.screenshot({
          path: join(previews, "mobile-failure.png"),
          fullPage: true,
        });
    throw error;
  } finally {
    await context.close();
  }
}
