import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "chatgpt_required",
      message: "Create workout plans through the ChatGPT FitLife connector. FitLife stores and tracks saved plans."
    },
    { status: 410 }
  );
}
