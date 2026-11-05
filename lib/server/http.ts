import { NextResponse } from "next/server";
import type { z } from "zod";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(error: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, status);
}

export function zodIssues(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** يحوّل أخطاء الخادم غير المتوقعة إلى 500 بدون تسريب التفاصيل */
export function serverError(err: unknown) {
  console.error(err);
  return errorJson("internal_error", 500);
}
