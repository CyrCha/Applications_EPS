import { NextResponse } from "next/server";

// Email sending is disabled to keep the app simple.
export async function POST() {
  return NextResponse.json(
    { error: "Email sending is disabled in this project." },
    { status: 501 }
  );
}
