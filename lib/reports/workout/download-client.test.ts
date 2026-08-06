import { describe, expect, it, vi } from "vitest";

import {
  downloadPerformedWorkoutReport,
  safeWorkoutReportFilename,
  WorkoutReportDownloadError,
} from "@/lib/reports/workout/download-client";

function documentDouble() {
  const anchor = {
    href: "",
    download: "",
    rel: "",
    style: { display: "" },
    click: vi.fn(),
    remove: vi.fn(),
  };
  const append = vi.fn();
  return {
    anchor,
    document: {
      createElement: vi.fn(() => anchor),
      body: { append },
    } as unknown as Document,
    append,
  };
}

describe("P8A workout report download client", () => {
  it("performs one authenticated request and cleans up the object URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Blob(["%PDF-test"], { type: "application/pdf" }), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            'attachment; filename="plaivra-workout-report-2026-08-06.pdf"',
        },
      }),
    );
    const { document, anchor, append } = documentDouble();
    const urlImpl = {
      createObjectURL: vi.fn(() => "blob:report"),
      revokeObjectURL: vi.fn(),
    };

    await downloadPerformedWorkoutReport({
      sessionId: "20000000-0000-4000-8000-000000000002",
      sessionAt: "2026-08-05T22:30:00.000Z",
      accessToken: "member-token",
      language: "de",
      timezone: "Europe/Berlin",
      fetchImpl,
      documentImpl: document,
      urlImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/workouts/history/performed/20000000-0000-4000-8000-000000000002/report?language=de&timezone=Europe%2FBerlin",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer member-token" },
        cache: "no-store",
      }),
    );
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.download).toBe("plaivra-workout-report-2026-08-06.pdf");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(urlImpl.revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("uses a safe date-derived fallback filename for an unsafe response header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Blob(["%PDF-test"], { type: "application/pdf" }), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="private-user-name.pdf"',
        },
      }),
    );
    const { document, anchor } = documentDouble();
    await downloadPerformedWorkoutReport({
      sessionId: "session",
      sessionAt: "2026-08-05T22:30:00.000Z",
      accessToken: "token",
      language: "ar",
      timezone: "Europe/Berlin",
      fetchImpl,
      documentImpl: document,
      urlImpl: {
        createObjectURL: () => "blob:report",
        revokeObjectURL: () => undefined,
      },
    });
    expect(anchor.download).toBe("plaivra-workout-report-2026-08-06.pdf");
    expect(
      safeWorkoutReportFilename(
        "2026-08-05T22:30:00.000Z",
        "Europe/Berlin",
      ),
    ).toBe("plaivra-workout-report-2026-08-06.pdf");
  });

  it("fails without creating a download for non-PDF or empty responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob([], { type: "application/pdf" }), {
          headers: { "Content-Type": "application/pdf" },
        }),
      );
    const { document } = documentDouble();
    const input = {
      sessionId: "session",
      sessionAt: "2026-08-05T22:30:00.000Z",
      accessToken: "token",
      language: "en" as const,
      timezone: "UTC",
      fetchImpl,
      documentImpl: document,
      urlImpl: {
        createObjectURL: vi.fn(() => "blob:never"),
        revokeObjectURL: vi.fn(),
      },
    };

    await expect(downloadPerformedWorkoutReport(input)).rejects.toBeInstanceOf(
      WorkoutReportDownloadError,
    );
    await expect(downloadPerformedWorkoutReport(input)).rejects.toBeInstanceOf(
      WorkoutReportDownloadError,
    );
    expect(input.urlImpl.createObjectURL).not.toHaveBeenCalled();
  });

  it("removes its temporary node and revokes the object URL when activation throws", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Blob(["%PDF-test"], { type: "application/pdf" }), {
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    const { document, anchor } = documentDouble();
    anchor.click.mockImplementationOnce(() => {
      throw new Error("activation failed");
    });
    const urlImpl = {
      createObjectURL: vi.fn(() => "blob:report"),
      revokeObjectURL: vi.fn(),
    };

    await expect(
      downloadPerformedWorkoutReport({
        sessionId: "session",
        sessionAt: "2026-08-05T22:30:00.000Z",
        accessToken: "token",
        language: "en",
        timezone: "UTC",
        fetchImpl,
        documentImpl: document,
        urlImpl,
      }),
    ).rejects.toThrow("activation failed");

    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(urlImpl.revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

});
