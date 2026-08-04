import assert from "node:assert/strict";
import test from "node:test";

import { login } from "./measure-pcs3-production.mjs";

function asyncSpy(implementation = async () => undefined) {
  const fn = async (...args) => {
    fn.calls.push(args);
    return implementation(...args);
  };
  fn.calls = [];
  return fn;
}

function locator({ count = 1, waitError = null } = {}) {
  return {
    waitFor: asyncSpy(async () => {
      if (waitError) throw waitError;
    }),
    count: asyncSpy(async () => count),
    fill: asyncSpy(),
    click: asyncSpy(),
    first() {
      return this;
    },
  };
}

function pageFixture({
  emailCount = 1,
  passwordCount = 1,
  submitCount = 1,
  waitError = null,
  finalUrl = "https://app.plaivra.com/dashboard",
} = {}) {
  const email = locator({ count: emailCount, waitError });
  const password = locator({ count: passwordCount, waitError });
  const submit = locator({ count: submitCount, waitError });
  const main = locator();
  let currentUrl = "https://app.plaivra.com/login";
  const page = {
    goto: asyncSpy(),
    url: () => currentUrl,
    locator: (selector) => {
      if (selector === 'input[type="email"]') return email;
      if (selector === 'input[type="password"]') return password;
      if (selector === "main#main-content, main") return main;
      return submit;
    },
    waitForFunction: asyncSpy(),
    waitForLoadState: asyncSpy(),
    waitForTimeout: asyncSpy(),
    waitForURL: asyncSpy(async (predicate) => {
      const next = new URL(finalUrl);
      if (!predicate(next)) throw new Error("predicate rejected");
      currentUrl = finalUrl;
    }),
  };
  return { page, email, password, submit, main };
}

const origin = new URL("https://app.plaivra.com/");

test("waits for exact visible controls and enabled submit before clicking", async () => {
  const { page, email, password, submit, main } = pageFixture();
  await login(page, origin, "synthetic@example.test", "secret");

  assert.equal(page.waitForLoadState.calls.length, 2);
  assert.deepEqual(page.waitForLoadState.calls[0], [
    "networkidle",
    { timeout: 10000 },
  ]);
  assert.deepEqual(page.waitForLoadState.calls[1], [
    "networkidle",
    { timeout: 5000 },
  ]);
  assert.deepEqual(email.waitFor.calls[0], [{ state: "visible", timeout: 30000 }]);
  assert.equal(password.waitFor.calls.length, 1);
  assert.equal(submit.waitFor.calls.length, 1);
  assert.equal(main.waitFor.calls.length, 1);
  assert.equal(page.waitForFunction.calls.length, 2);
  assert.deepEqual(page.waitForTimeout.calls[0], [300]);
  assert.equal(email.fill.calls.length, 1);
  assert.equal(password.fill.calls.length, 1);
  assert.equal(submit.click.calls.length, 1);
});

test("fails closed when login controls are not unique", async () => {
  const { page, submit } = pageFixture({ emailCount: 2 });
  await assert.rejects(
    login(page, origin, "synthetic@example.test", "secret"),
    /SYNTHETIC_AUTHENTICATION_FAILED/,
  );
  assert.equal(submit.click.calls.length, 0);
});

test("classifies client-render readiness timeouts safely", async () => {
  const { page } = pageFixture({ waitError: new Error("timeout") });
  await assert.rejects(
    login(page, origin, "synthetic@example.test", "secret"),
    /SYNTHETIC_AUTHENTICATION_FAILED/,
  );
});

test("rejects a foreign-origin redirect after submit", async () => {
  const { page } = pageFixture({ finalUrl: "https://example.com/dashboard" });
  await assert.rejects(
    login(page, origin, "synthetic@example.test", "secret"),
    /MEASUREMENT_REDIRECT_ORIGIN_INVALID/,
  );
});
