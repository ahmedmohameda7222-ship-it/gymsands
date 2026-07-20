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
});
