import { describe, expect, it } from "vitest";

import arMessages from "@/messages/ar.json";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";

type MessageNode = string | { [key: string]: MessageNode };

function describeShape(value: MessageNode): unknown {
  if (typeof value === "string") return "string";
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, describeShape(child)])
  );
}

function assertStringLeaves(value: MessageNode, path: string): void {
  if (typeof value === "string") {
    expect(value.trim().length, path).toBeGreaterThan(0);
    return;
  }
  Object.entries(value).forEach(([key, child]) => assertStringLeaves(child, `${path}.${key}`));
}

describe("foundation message files", () => {
  it("keeps EN, DE, and AR recursively shape-compatible", () => {
    const englishShape = describeShape(enMessages);
    expect(describeShape(deMessages)).toEqual(englishShape);
    expect(describeShape(arMessages)).toEqual(englishShape);
  });

  it("contains the approved skip-link messages", () => {
    expect(enMessages.Common.skipToContent).toBe("Skip to content");
    expect(deMessages.Common.skipToContent).toBe("Zum Inhalt springen");
    expect(arMessages.Common.skipToContent).toBe("الانتقال إلى المحتوى");
  });

  it("contains non-empty ActiveWorkout namespaces with string leaves", () => {
    expect(enMessages.ActiveWorkout).toBeTruthy();
    expect(deMessages.ActiveWorkout).toBeTruthy();
    expect(arMessages.ActiveWorkout).toBeTruthy();
    assertStringLeaves(enMessages.ActiveWorkout, "en.ActiveWorkout");
    assertStringLeaves(deMessages.ActiveWorkout, "de.ActiveWorkout");
    assertStringLeaves(arMessages.ActiveWorkout, "ar.ActiveWorkout");
  });
});
