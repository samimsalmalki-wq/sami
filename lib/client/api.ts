"use client";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export async function getJson<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store" }));
}

export async function sendJson<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  return handle<T>(
    await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
}
