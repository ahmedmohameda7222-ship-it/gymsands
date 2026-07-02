import { describe, expect, it } from "vitest";
import {
  createProgressPhotoPath,
  maxProgressPhotoBytes,
  validateProgressPhotoFile
} from "./progress-photos";

const userId = "11111111-1111-4111-8111-111111111111";

describe("progress photo upload validation", () => {
  it("accepts supported non-empty images within the bucket limit", () => {
    expect(() => validateProgressPhotoFile({ name: "photo.jpg", size: 1024, type: "image/jpeg" })).not.toThrow();
  });

  it("rejects empty, oversized, and unsupported files", () => {
    expect(() => validateProgressPhotoFile({ name: "empty.jpg", size: 0, type: "image/jpeg" })).toThrow("cannot be empty");
    expect(() => validateProgressPhotoFile({ name: "large.png", size: maxProgressPhotoBytes + 1, type: "image/png" })).toThrow("10 MB");
    expect(() => validateProgressPhotoFile({ name: "payload.svg", size: 10, type: "image/svg+xml" })).toThrow("JPEG, PNG, or WebP");
  });

  it("builds an owner-scoped path and removes traversal characters from filenames", () => {
    const path = createProgressPhotoPath({
      userId,
      type: "front",
      takenOn: "2026-07-02",
      fileName: "../../Private Photo.JPG"
    }, "object-id");
    expect(path).toBe(`${userId}/front/2026-07-02/object-id-private-photo.jpg`);
    expect(path).not.toContain("..");
  });

  it("rejects invalid owners, runtime photo types, and path-like dates", () => {
    expect(() => createProgressPhotoPath({ userId: "not-a-user", type: "front", takenOn: "2026-07-02", fileName: "x.jpg" })).toThrow("valid signed-in user");
    expect(() => createProgressPhotoPath({ userId, type: "other" as "front", takenOn: "2026-07-02", fileName: "x.jpg" })).toThrow("front, side, or back");
    expect(() => createProgressPhotoPath({ userId, type: "front", takenOn: "../other-user", fileName: "x.jpg" })).toThrow("valid date");
  });
});
