import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const origin = new URL("https://app.plaivra.com");
const output = "quality-reports/pcs3-auth-diagnostic-1b059d94";
const accounts = [
  {
    label: "populated",
    email: process.env.PLAIVRA_SMOKE_POPULATED_EMAIL,
    password: process.env.PLAIVRA_SMOKE_POPULATED_PASSWORD,
  },
  {
    label: "empty",
    email: process.env.PLAIVRA_SMOKE_EMPTY_EMAIL,
    password: process.env.PLAIVRA_SMOKE_EMPTY_PASSWORD,
  },
];

function routeCategory(value) {
  try {
    const url = new URL(value);
    if (url.origin !== origin.origin) return "cross_origin";
    if (url.pathname === "/login") return "login";
    if (url.pathname === "/dashboard") return "dashboard";
    if (url.pathname === "/workout-history") return "workout_history";
    if (url.pathname === "/welcome") return "welcome";
    if (url.pathname.startsWith("/onboarding")) return "onboarding";
    if (url.pathname === "/register" || url.pathname.startsWith("/auth/")) {
      return "auth_entry";
    }
    if (url.pathname === "/") return "public_root";
    return "same_origin_other";
  } catch {
    return "invalid_url";
  }
}

function pushRoute(sequence, value) {
  const category = routeCategory(value);
  if (sequence.at(-1) !== category) sequence.push(category);
}

async function inspectAccount(browser, account) {
  const result = {
    account: account.label,
    passed: false,
    failureStage: null,
    credentialShape: {
      emailPresent: Boolean(account.email),
      passwordPresent: Boolean(account.password),
      emailTrimStable:
        typeof account.email === "string" && account.email === account.email.trim(),
      emailSingleLine:
        typeof account.email === "string" && !/[\r\n]/u.test(account.email),
      passwordSingleLine:
        typeof account.password === "string" && !/[\r\n]/u.test(account.password),
    },
    formGate: {
      emailValueMatchesCredential: null,
      passwordValueMatchesCredential: null,
      emailValid: null,
      passwordValid: null,
      formValid: null,
      formNoValidate: null,
      clickEventCount: 0,
      submitEventCount: 0,
      invalidEventCount: 0,
      invalidEmailCount: 0,
      invalidPasswordCount: 0,
    },
    tokenCount: 0,
    tokenStatus: null,
    settingsCount: 0,
    settingsStatus: null,
    bootstrapCount: 0,
    bootstrapStatus: null,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    requestFailureCount: 0,
    sessionKeyPresent: false,
    finalRoute: null,
    routeSequence: [],
  };

  if (!account.email || !account.password) {
    result.failureStage = "credentials_missing";
    return result;
  }

  const context = await browser.newContext({
    locale: "en-GB",
    timezoneId: "Europe/Berlin",
  });
  const page = await context.newPage();
  let stage = "open_login";

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) pushRoute(result.routeSequence, frame.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrorCount += 1;
  });
  page.on("pageerror", () => {
    result.pageErrorCount += 1;
  });
  page.on("requestfailed", (request) => {
    if (!/ERR_ABORTED/i.test(request.failure()?.errorText ?? "")) {
      result.requestFailureCount += 1;
    }
  });
  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (url.pathname === "/auth/v1/token") {
        result.tokenCount += 1;
        result.tokenStatus = response.status();
      } else if (url.pathname === "/rest/v1/user_app_settings") {
        result.settingsCount += 1;
        result.settingsStatus = response.status();
      } else if (url.pathname === "/rest/v1/rpc/get_private_app_bootstrap_v1") {
        result.bootstrapCount += 1;
        result.bootstrapStatus = response.status();
      }
    } catch {
      // Persist no raw request information.
    }
  });

  try {
    await page.goto(new URL("/login", origin).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    pushRoute(result.routeSequence, page.url());

    stage = "wait_controls";
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    const submit = page.locator('button[type="submit"]');
    await Promise.all([
      email.waitFor({ state: "visible", timeout: 30_000 }),
      password.waitFor({ state: "visible", timeout: 30_000 }),
      submit.waitFor({ state: "visible", timeout: 30_000 }),
    ]);

    await page.evaluate(() => {
      const emailInput = document.querySelector('input[type="email"]');
      const passwordInput = document.querySelector('input[type="password"]');
      const submitButton = document.querySelector('button[type="submit"]');
      const form = submitButton?.closest("form");
      const state = {
        clickEventCount: 0,
        submitEventCount: 0,
        invalidEventCount: 0,
        invalidEmailCount: 0,
        invalidPasswordCount: 0,
      };
      Object.defineProperty(window, "__pcs3SafeFormDiagnostic", {
        value: state,
        configurable: true,
      });
      submitButton?.addEventListener("click", () => {
        state.clickEventCount += 1;
      }, true);
      form?.addEventListener("submit", () => {
        state.submitEventCount += 1;
      }, true);
      form?.addEventListener("invalid", (event) => {
        state.invalidEventCount += 1;
        if (event.target === emailInput) state.invalidEmailCount += 1;
        if (event.target === passwordInput) state.invalidPasswordCount += 1;
      }, true);
    });

    stage = "fill_controls";
    await email.fill(account.email);
    await password.fill(account.password);
    await page.waitForFunction(
      () => {
        const button = document.querySelector('button[type="submit"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      undefined,
      { timeout: 30_000 },
    );

    result.formGate = {
      ...result.formGate,
      ...(await page.evaluate(
        ({ expectedEmail, expectedPassword }) => {
          const emailInput = document.querySelector('input[type="email"]');
          const passwordInput = document.querySelector('input[type="password"]');
          const submitButton = document.querySelector('button[type="submit"]');
          const form = submitButton?.closest("form");
          return {
            emailValueMatchesCredential:
              emailInput instanceof HTMLInputElement && emailInput.value === expectedEmail,
            passwordValueMatchesCredential:
              passwordInput instanceof HTMLInputElement && passwordInput.value === expectedPassword,
            emailValid: emailInput instanceof HTMLInputElement ? emailInput.checkValidity() : false,
            passwordValid:
              passwordInput instanceof HTMLInputElement ? passwordInput.checkValidity() : false,
            formValid: form instanceof HTMLFormElement ? form.checkValidity() : false,
            formNoValidate: form instanceof HTMLFormElement ? form.noValidate : null,
          };
        },
        { expectedEmail: account.email, expectedPassword: account.password },
      )),
    };

    stage = "submit";
    const leftLogin = page
      .waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    await submit.click();
    const navigated = await leftLogin;
    await page.waitForTimeout(1_500);

    const eventState = await page.evaluate(
      () => window.__pcs3SafeFormDiagnostic ?? {
        clickEventCount: 0,
        submitEventCount: 0,
        invalidEventCount: 0,
        invalidEmailCount: 0,
        invalidPasswordCount: 0,
      },
    );
    result.formGate = { ...result.formGate, ...eventState };

    stage = "inspect_result";
    pushRoute(result.routeSequence, page.url());
    result.finalRoute = routeCategory(page.url());
    result.sessionKeyPresent = await page.evaluate(() => {
      const keys = [
        ...Object.keys(window.localStorage),
        ...Object.keys(window.sessionStorage),
      ];
      return keys.some((key) => key.includes("auth-token"));
    });
    result.passed =
      navigated &&
      result.finalRoute !== "login" &&
      result.finalRoute !== "auth_entry" &&
      result.tokenStatus === 200 &&
      result.sessionKeyPresent;
    if (!result.passed) result.failureStage = "post_submit_gate";
  } catch {
    result.failureStage = stage;
    result.finalRoute = routeCategory(page.url());
    pushRoute(result.routeSequence, page.url());
  } finally {
    await context.close();
  }

  return result;
}

const browser = await chromium.launch({ headless: true });
let results;
try {
  results = [];
  for (const account of accounts) {
    results.push(await inspectAccount(browser, account));
  }
} finally {
  await browser.close();
}

const summary = {
  checkedAt: new Date().toISOString(),
  expectedCommit: "1b059d944e619ad6919e2da96b204b935fa59596",
  origin: origin.origin,
  syntheticDataOnly: true,
  credentialsLogged: false,
  passed: results.every((result) => result.passed),
  accounts: results,
};
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  `${output}/summary.md`,
  [
    "# PCS-3 Auth Diagnostic",
    "",
    `- Overall result: ${summary.passed ? "PASS" : "FAIL"}`,
    `- Reviewed commit: ${summary.expectedCommit}`,
    "- Synthetic fixtures only: yes",
    "- Credentials logged: no",
    "",
    ...results.flatMap((result) => [
      `## ${result.account}`,
      "",
      `- Result: ${result.passed ? "PASS" : "FAIL"}`,
      `- Failure stage: ${result.failureStage ?? "none"}`,
      `- Final route category: ${result.finalRoute}`,
      `- Native email valid: ${result.formGate.emailValid}`,
      `- Native form valid: ${result.formGate.formValid}`,
      `- Click events: ${result.formGate.clickEventCount}`,
      `- Submit events: ${result.formGate.submitEventCount}`,
      `- Invalid events: ${result.formGate.invalidEventCount}`,
      `- Auth token status: ${result.tokenStatus ?? "none"}`,
      `- Bootstrap status: ${result.bootstrapStatus ?? "none"}`,
      `- Session key present: ${result.sessionKeyPresent ? "yes" : "no"}`,
      "",
    ]),
  ].join("\n"),
);
if (!summary.passed) process.exitCode = 1;
