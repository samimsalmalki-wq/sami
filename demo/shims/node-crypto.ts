/** بديل node:crypto في المتصفح (randomUUID فقط هو المستخدم في هذه النسخة) */
export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createHash(): never {
  throw new Error("createHash is not available in the browser version");
}

export function timingSafeEqual(): never {
  throw new Error("timingSafeEqual is not available in the browser version");
}
