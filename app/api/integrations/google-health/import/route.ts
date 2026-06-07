import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json(
    {
      imported: 0,
      featureGated: true,
      message: "Google Health import is OAuth-ready but feature-gated until the Google API project and data scopes are approved."
    },
    { status: 202 }
  );
}
