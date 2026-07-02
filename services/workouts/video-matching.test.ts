import { describe, expect, it } from "vitest";
import { isEmbeddableVideo, toEmbedUrl } from "./video-matching";

describe("exercise video embed URL policy", () => {
  it("normalizes exact HTTPS YouTube and Vimeo origins", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe("https://www.youtube.com/embed/abcdefghijk");
    expect(toEmbedUrl("https://youtu.be/abcdefghijk?t=10")).toBe("https://www.youtube.com/embed/abcdefghijk");
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(isEmbeddableVideo("https://player.vimeo.com/video/123456789")).toBe(true);
  });

  it("rejects lookalike hosts, insecure URLs, scripts, and malformed IDs", () => {
    for (const value of [
      "https://youtube.com.evil.example/watch?v=abcdefghijk",
      "https://evil-youtube.com/watch?v=abcdefghijk",
      "http://www.youtube.com/watch?v=abcdefghijk",
      "javascript:alert(1)",
      "https://vimeo.com/not-a-number"
    ]) {
      expect(toEmbedUrl(value)).toBeNull();
      expect(isEmbeddableVideo(value)).toBe(false);
    }
  });
});
