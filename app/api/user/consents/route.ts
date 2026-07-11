import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { REQUIRED_CONSENTS } from "@/lib/legal/versions";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { launchAgeSchema } from "@/lib/auth/eligibility";

export const runtime = "nodejs";

const requiredConsentKeys = new Set(REQUIRED_CONSENTS.map((item) => `${item.consent_type}:${item.version}`));

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  let body: {
    declared_age?: unknown;
    consents?: Array<{ consent_type?: string; version?: string; granted?: boolean }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const age = launchAgeSchema.safeParse(body.declared_age);
  if (!age.success) {
    return NextResponse.json(
      { error: age.message, code: age.code },
      { status: age.code === "age_ineligible" ? 403 : 400 }
    );
  }

  const submitted = Array.isArray(body.consents) ? body.consents : [];
  const submittedKeys = new Set(
    submitted
      .filter((item) => item.granted === true && item.consent_type && item.version)
      .map((item) => `${item.consent_type}:${item.version}`)
  );

  if ([...requiredConsentKeys].some((key) => !submittedKeys.has(key))) {
    return NextResponse.json({ error: "All required consent records must be granted." }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = request.headers.get("user-agent") || null;
  const grantedAt = new Date().toISOString();
  const rows = REQUIRED_CONSENTS.map((item) => ({
    user_id: context.user.id,
    consent_type: item.consent_type,
    version: item.version,
    granted: true,
    granted_at: grantedAt,
    revoked_at: null,
    ip_address: forwardedFor,
    user_agent: userAgent
  }));

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("user_consents")
    .upsert(rows, { onConflict: "user_id,consent_type,version" });

  if (error) {
    console.error("Plaivra consent save failed:", error.message);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Consent records conflict with an existing saved consent. Sign in to retry.", code: "consent_conflict" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Your account was created, but consent records could not be saved yet. Sign in to retry.", code: "consent_save_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
