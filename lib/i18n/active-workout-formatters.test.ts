import { describe, expect, it } from "vitest";

import {
  createActiveWorkoutFormatters,
  formatActiveWorkoutTimer
} from "@/lib/i18n/active-workout-formatters";

describe("Active Workout formatters", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [65, "1:05"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [-5, "0:00"],
    [Number.NaN, "0:00"],
    [Number.POSITIVE_INFINITY, "0:00"]
  ])("formats %s seconds as %s", (value, expected) => {
    expect(formatActiveWorkoutTimer(value)).toBe(expected);
  });

  it("keeps timer segments in stable Latin order for Arabic UI", () => {
    const arabic = createActiveWorkoutFormatters("ar");
    expect(arabic.timer(3661)).toBe("1:01:01");
    expect(arabic.timer(3661)).toMatch(/^[0-9]+:[0-9]{2}:[0-9]{2}$/);
  });

  it("uses locale-aware decimal and integer display", () => {
    const english = createActiveWorkoutFormatters("en");
    const german = createActiveWorkoutFormatters("de");
    const arabic = createActiveWorkoutFormatters("ar");

    expect(english.decimal(1234.5)).toBe(
      new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5)
    );
    expect(german.decimal(1234.5)).toBe(
      new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5)
    );
    expect(arabic.decimal(1234.5)).toBe(
      new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5)
    );
    expect(english.integer(1234)).toBe(new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(1234));
    expect(german.integer(1234)).toBe(new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(1234));
    expect(arabic.integer(1234)).toBe(new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(1234));
    expect(english.decimal(1234.5)).not.toBe(german.decimal(1234.5));
  });

  it("formats localized conjunction lists", () => {
    const values = ["Squat", "Press", "Row"];
    const english = createActiveWorkoutFormatters("en").list(values);
    const german = createActiveWorkoutFormatters("de").list(values);
    const arabic = createActiveWorkoutFormatters("ar").list(values);

    for (const output of [english, german, arabic]) {
      values.forEach((value) => expect(output).toContain(value));
    }
    expect(german).not.toBe(english);
    expect(arabic).not.toBe(english);
  });

  it("formats dates and times with an explicit UTC timezone", () => {
    const fixed = new Date("2026-07-20T13:45:00.000Z");
    const english = createActiveWorkoutFormatters("en");
    const german = createActiveWorkoutFormatters("de");
    const arabic = createActiveWorkoutFormatters("ar");

    const enDate = english.date(fixed, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const deDate = german.date(fixed, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const arDate = arabic.date(fixed, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

    expect(deDate).not.toBe(enDate);
    expect(arDate).not.toBe(enDate);
    expect(english.time(fixed, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })).toMatch(/13[:.]45/);
  });

  it("combines localized values with supported measurement labels", () => {
    const english = createActiveWorkoutFormatters("en");
    const german = createActiveWorkoutFormatters("de");
    const arabic = createActiveWorkoutFormatters("ar");

    expect(english.measurement(82.5, "kg")).toContain("kg");
    expect(german.measurement(12, "reps")).toContain("Wdh.");
    expect(arabic.measurement(30, "seconds")).toContain("ثانية");
  });
});
