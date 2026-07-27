import path from "node:path";

import {
  contract,
  directExerciseName,
  errorMessage,
  observations,
  outputDir,
  overlaps,
  writeReport
} from "./aw5-correction-qa-shared.mjs";

export async function frameworkChrome(page) {
  return page.evaluate(() => {
    const details = [];
    let detected = false;
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const root = portal.shadowRoot;
      if (!root) continue;
      const text = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const overlay = root.querySelector(
        "nextjs-errors-dialog, nextjs-error-dialog, [data-nextjs-error-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]"
      );
      if (overlay || /(?:Build Error|Unhandled Runtime Error|Runtime Error|Failed to compile|\d+ Issue)/i.test(text)) {
        detected = true;
        details.push(text.slice(0, 500));
      }
    }
    return { detected, details };
  });
}

export async function geometry(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const value = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && value.width > 0 && value.height > 0;
    };
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!visible(element)) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const rects = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
      });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      direction: document.documentElement.dir || getComputedStyle(document.body).direction || "ltr",
      close: rect("[data-workout-session-close]"),
      heatMap: rect("[data-aw5-mini-heat-map-slot]"),
      sessionTitle: rect("[data-aw5-session-title]"),
      metadata: rect("[data-aw5-metadata]"),
      pause: rect("[data-aw5-pause-resume]"),
      sticky: rect("[data-aw5-sticky-actions]"),
      reps: rect("#active-set-reps"),
      weight: rect("#active-set-weight"),
      details: rect("[data-active-set-details-trigger]"),
      setPath: rect("[data-aw5-set-path]"),
      restPresets: rects("[data-aw5-rest-presets] button"),
      feedback: rect("[data-aw5-feedback]"),
      clippedControls: [...document.querySelectorAll("[data-aw5-execution-shell] button")]
        .filter(visible)
        .filter((element) => element.scrollWidth > element.clientWidth + 2)
        .map((element) => element.textContent?.replace(/\s+/g, " ").trim() || element.getAttribute("aria-label") || "<unlabelled>"),
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      headings: [...document.querySelectorAll("h1,h2")]
        .filter(visible)
        .map((element) => {
          const value = element.getBoundingClientRect();
          return { text: element.textContent?.replace(/\s+/g, " ").trim() ?? "", height: value.height, top: value.top };
        })
    };
  });
}

export function geometryFailures(metrics, options = {}) {
  const failures = [];
  for (const [name, target] of [
    ["Mini Heat Map", metrics.heatMap],
    ["session title", metrics.sessionTitle],
    ["metadata", metrics.metadata],
    ["Pause/Resume", metrics.pause]
  ]) {
    if (overlaps(metrics.close, target)) failures.push(`close intersects ${name}`);
  }
  if (metrics.close && metrics.heatMap) {
    const closeCenter = (metrics.close.left + metrics.close.right) / 2;
    const heatCenter = (metrics.heatMap.left + metrics.heatMap.right) / 2;
    if (metrics.direction === "rtl" && closeCenter <= heatCenter) failures.push("Arabic close control is not at logical start");
    if (metrics.direction !== "rtl" && closeCenter >= heatCenter) failures.push("LTR close control is not at logical start");
  }
  for (const [name, target] of [
    ["reps input", metrics.reps],
    ["weight input", metrics.weight],
    ["details trigger", metrics.details],
    ["set path", metrics.setPath],
    ["validation feedback", metrics.feedback]
  ]) {
    if (overlaps(metrics.sticky, target)) failures.push(`sticky intersects ${name}`);
  }
  if (options.restPresets) {
    metrics.restPresets.forEach((target, index) => {
      if (overlaps(metrics.sticky, target)) failures.push(`sticky intersects rest preset ${index + 1}`);
    });
  }
  if (options.initial320) {
    if (!metrics.setPath || metrics.setPath.top < 0 || metrics.setPath.bottom > metrics.viewport.height) failures.push("set path is not fully visible in the initial 320x568 viewport");
    if (!metrics.sticky || metrics.sticky.top < 0 || metrics.sticky.bottom > metrics.viewport.height + 1) failures.push("primary CTA is not fully visible in the initial 320x568 viewport");
    if (metrics.sticky && Math.abs(metrics.viewport.height - metrics.sticky.bottom) > 2) failures.push("session CTA leaves an unnecessary mobile-navigation gap");
  }
  if (options.direct) {
    const routeHero = metrics.headings.some((heading) => /^Start\b/i.test(heading.text) && heading.height > 32);
    const exerciseHeadings = metrics.headings.filter((heading) => heading.text === directExerciseName);
    if (routeHero) failures.push("loaded direct route contains a route-level Start heading");
    if (exerciseHeadings.length !== 1) failures.push(`direct exercise heading count is ${exerciseHeadings.length}, expected 1`);
  }
  if (options.keyboard && metrics.sticky && metrics[options.keyboard] && metrics[options.keyboard].bottom > metrics.sticky.top) failures.push(`focused ${options.keyboard} input cannot be scrolled above the sticky CTA`);
  if (metrics.clippedControls.length) failures.push(`clipped translated control: ${metrics.clippedControls.join(" | ")}`);
  if (metrics.horizontalOverflowPx > 1) failures.push(`horizontal overflow is ${metrics.horizontalOverflowPx}px`);
  return failures;
}

export function expectedDevelopmentWarning(message) {
  return /Reduced Motion enabled on your device/i.test(message)
    || /Content Security Policy.*(?:unsafe-eval|eval)/i.test(message)
    || /Refused to evaluate a string as JavaScript.*unsafe-eval/i.test(message)
    || /Download the React DevTools/i.test(message);
}

export async function domDiagnostics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const text = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    const bodyText = document.body?.innerText ?? "";
    return {
      title: document.title,
      bodyText: bodyText.replace(/\s+/g, " ").trim().slice(0, 3000),
      visibleHeadings: text("h1,h2"),
      loadingState: Boolean(document.querySelector('[aria-busy="true"], [data-loading], [data-testid*="loading"], .animate-pulse')),
      errorState: Boolean(document.querySelector('[data-error-state], [role="alert"]')) || /(?:failed|error|try again|not found)/i.test(bodyText),
      toastText: text('[data-sonner-toast], [data-toast], [role="status"]'),
      executionShell: Boolean(document.querySelector("[data-aw5-execution-shell]")),
      activeSetState: Boolean(document.querySelector("[data-active-set-state]"))
    };
  });
}

export function classifyFailure(session, diagnostics, error) {
  const reason = errorMessage(error);
  const history = [...session.requestHistory, ...session.requestFailures];
  const has = (pattern) => history.some((entry) => pattern.test(entry.url));
  const failedStatus = (pattern) => history.some((entry) => pattern.test(entry.url) && Number(entry.status) >= 400);
  if (failedStatus(/auth|token|session/i) || /unauthori[sz]ed|sign in|authentication/i.test(`${reason} ${diagnostics.bodyText}`)) return "auth fixture mismatch";
  if (session.pageErrors.length || session.consoleErrors.length || /Unhandled|Runtime Error|Failed to compile/i.test(reason)) return "unhandled application error";
  if (diagnostics.errorState || diagnostics.loadingState) return "unexpected loading/error surface";
  const startPattern = session.direct ? /start_or_resume_direct_workout_session_atomic/ : /start_or_resume_workout_session_atomic/;
  if (!diagnostics.executionShell && !has(startPattern)) return "route bootstrap fixture mismatch";
  if (!diagnostics.executionShell && failedStatus(startPattern)) return "session-start response mismatch";
  if (!diagnostics.executionShell && session.fixture?.sessionId !== contract.activeSessionId) return "session-root mismatch";
  if (!diagnostics.executionShell && has(/workout_session_prescription/) && /prescription|snapshot|set/i.test(`${reason} ${diagnostics.bodyText}`)) return "prescription graph mismatch";
  if (!diagnostics.executionShell && has(/exercise_logs/) && /log|performed/i.test(`${reason} ${diagnostics.bodyText}`)) return "performed-log mismatch";
  if (!diagnostics.executionShell && has(/workout_session_prescription/)) return "execution-state mismatch";
  if (/selector|locator|waitForSelector/i.test(reason)) return "incorrect selector";
  return "unexpected loading/error surface";
}

export async function captureFailure(session, error, { bootstrapFailed = false } = {}) {
  const diagnostics = await domDiagnostics(session.page).catch(() => ({
    title: "<unavailable>", bodyText: "<unavailable>", visibleHeadings: [], loadingState: false,
    errorState: false, toastText: [], executionShell: false, activeSetState: false
  }));
  const classification = classifyFailure(session, diagnostics, error);
  const artifact = `${session.name}-failure.png`;
  await session.page.screenshot({ path: path.join(outputDir, artifact), fullPage: false }).catch(() => undefined);
  const failure = `${classification}: ${errorMessage(error)}`;
  observations.push({
    name: session.name,
    route: session.page.url(),
    currentUrl: session.page.url(),
    status: session.response?.status() ?? null,
    artifact,
    classification,
    bootstrapFailed,
    documentTitle: diagnostics.title,
    bodyText: diagnostics.bodyText,
    visibleHeadings: diagnostics.visibleHeadings,
    loadingState: diagnostics.loadingState,
    errorState: diagnostics.errorState,
    toastText: diagnostics.toastText,
    executionShell: diagnostics.executionShell,
    activeSetState: diagnostics.activeSetState,
    pageErrors: session.pageErrors,
    consoleErrors: session.consoleErrors,
    consoleWarnings: session.consoleWarnings,
    requestFailures: session.requestFailures,
    requestHistory: session.requestHistory.slice(-50),
    failures: [failure]
  });
  await writeReport();
  return { classification, failure };
}

export async function record(session, options = {}, additionalFailures = []) {
  const metrics = await geometry(session.page);
  const chrome = await frameworkChrome(session.page);
  const warnings = session.consoleWarnings.filter((message) => !expectedDevelopmentWarning(message));
  const failures = [
    ...geometryFailures(metrics, { ...options, direct: session.direct }),
    ...additionalFailures,
    ...session.pageErrors.map((message) => `page error: ${message}`),
    ...session.consoleErrors.map((message) => `console error: ${message}`),
    ...warnings.map((message) => `console warning: ${message}`),
    ...session.requestFailures.map((entry) => `request failure: ${entry.method} ${entry.url} ${entry.failure}`)
  ];
  if (chrome.detected) failures.push(`framework overlay detected: ${chrome.details.join(" | ")}`);
  const artifact = `${session.name}.png`;
  await session.page.screenshot({ path: path.join(outputDir, artifact), fullPage: false });
  observations.push({
    name: session.name,
    route: session.page.url(),
    currentUrl: session.page.url(),
    status: session.response?.status() ?? null,
    artifact,
    classification: failures.length ? "rendered assertion failure" : null,
    bootstrapFailed: false,
    metrics,
    chrome,
    pageErrors: session.pageErrors,
    consoleErrors: session.consoleErrors,
    consoleWarnings: session.consoleWarnings,
    requestFailures: session.requestFailures,
    requestHistory: session.requestHistory.slice(-50),
    failures
  });
  await writeReport();
  return failures;
}
