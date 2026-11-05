import { DEDUPE_WINDOW_MS, DIRECTION_WINDOW_MS } from "./constants";

/**
 * فلترة القراءات المكررة وتحديد اتجاه الحركة.
 *
 * القارئ يقرأ نفس البطاقة عشرات المرات بالثانية. كل «مرور» للبطاقة من البوابة يبدأ بقراءة أولى:
 *   - القراءة الأولى تفتح مرورًا جديدًا وتتحول إلى حركة (اتجاهها غير مؤكد في البداية).
 *   - أي قراءة لنفس EPC على نفس البوابة خلال 5 ثوانٍ من القراءة الأولى مكررة (is_duplicate).
 *   - إذا ظهرت البطاقة على الهوائي الآخر خلال 3 ثوانٍ يتأكد الاتجاه:
 *       A (داخلي) ثم B (خارجي) = خروج، B ثم A = دخول.
 *   - إذا قُرئت على هوائي واحد فقط يبقى الاتجاه غير مؤكد ولا يتغير المخزون.
 *
 * التأكيد قد يصل في دفعة قراءات لاحقة، لذلك تُمرَّر حالة المرور المفتوح من قاعدة البيانات.
 */

export type Antenna = "A" | "B";
export type Direction = "in" | "out";

export interface RawRead {
  epc: string;
  antenna: Antenna;
  rssi: number | null;
  readAt: Date;
}

export interface PassSession {
  /** معرّف الحركة الناتجة عن هذا المرور */
  key: string;
  epc: string;
  /** وقت القراءة الأولى */
  startedAt: Date;
  firstAntenna: Antenna;
  /** null حتى يتأكد الاتجاه */
  direction: Direction | null;
}

export type ReadDecision =
  | { kind: "primary"; read: RawRead; session: PassSession }
  | { kind: "duplicate"; read: RawRead; session: PassSession; confirms: Direction | null };

export interface ReadWindows {
  dedupeMs?: number;
  directionMs?: number;
}

/** A ثم B = خروج، B ثم A = دخول، نفس الهوائي = لا يحدد اتجاهًا */
export function directionFromAntennas(first: Antenna, second: Antenna): Direction | null {
  if (first === second) return null;
  return first === "A" ? "out" : "in";
}

/** هل القراءة مكررة لمرور مفتوح؟ (نفس EPC ونفس البوابة خلال 5 ثوانٍ) */
export function isDuplicateRead(
  read: RawRead,
  session: PassSession | undefined,
  windowMs: number = DEDUPE_WINDOW_MS,
): boolean {
  if (!session || session.epc !== read.epc) return false;
  return Math.abs(read.readAt.getTime() - session.startedAt.getTime()) < windowMs;
}

/** الاتجاه اللي تؤكده هذه القراءة للمرور، أو null */
export function confirmedDirection(
  read: RawRead,
  session: PassSession,
  windowMs: number = DIRECTION_WINDOW_MS,
): Direction | null {
  if (session.direction !== null) return null;
  const elapsed = read.readAt.getTime() - session.startedAt.getTime();
  if (elapsed < 0 || elapsed > windowMs) return null;
  return directionFromAntennas(session.firstAntenna, read.antenna);
}

/**
 * يصنّف دفعة قراءات من بوابة واحدة.
 * @param known  المرورات المفتوحة لنفس البوابة (آخر قراءة أولى لكل EPC) من قاعدة البيانات
 * @param newKey ينشئ معرّف الحركة لكل مرور جديد
 */
export function processReads(
  reads: readonly RawRead[],
  known: ReadonlyMap<string, PassSession>,
  newKey: (read: RawRead) => string,
  windows: ReadWindows = {},
): { decisions: ReadDecision[]; sessions: Map<string, PassSession> } {
  const dedupeMs = windows.dedupeMs ?? DEDUPE_WINDOW_MS;
  const directionMs = windows.directionMs ?? DIRECTION_WINDOW_MS;
  const sessions = new Map<string, PassSession>();
  for (const [epc, session] of known) sessions.set(epc, { ...session });

  const sorted = [...reads].sort((a, b) => a.readAt.getTime() - b.readAt.getTime());
  const decisions: ReadDecision[] = [];

  for (const read of sorted) {
    const current = sessions.get(read.epc);
    if (current && isDuplicateRead(read, current, dedupeMs)) {
      const confirms = confirmedDirection(read, current, directionMs);
      if (confirms) current.direction = confirms;
      decisions.push({ kind: "duplicate", read, session: current, confirms });
      continue;
    }
    const session: PassSession = {
      key: newKey(read),
      epc: read.epc,
      startedAt: read.readAt,
      firstAntenna: read.antenna,
      direction: null,
    };
    sessions.set(read.epc, session);
    decisions.push({ kind: "primary", read, session });
  }

  return { decisions, sessions };
}

/** ملخص الدفعة: خام، مكرر، مرورات جديدة، اتجاهات تأكدت */
export function summarizeDecisions(decisions: readonly ReadDecision[]) {
  let duplicates = 0;
  let passes = 0;
  let confirmed = 0;
  for (const d of decisions) {
    if (d.kind === "primary") passes++;
    else {
      duplicates++;
      if (d.confirms) confirmed++;
    }
  }
  return { raw: decisions.length, duplicates, passes, confirmed };
}
