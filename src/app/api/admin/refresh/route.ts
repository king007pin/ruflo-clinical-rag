import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const secret = process.env.CRON_SECRET;
  const url = new URL("/api/cron/refresh", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001");
  if (secret) url.searchParams.set("secret", secret);

  const res = await fetch(url.toString());
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
