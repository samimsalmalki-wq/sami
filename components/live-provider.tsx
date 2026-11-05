"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase } from "@/lib/client/supabase";

/**
 * التحديث اللحظي: يشترك في تغييرات movements وalerts عبر Supabase Realtime،
 * ويعيد جلب ما تأثر من البيانات (الحسابات نفسها على الخادم). بدون اتصال لحظي تتحدث الواجهة كل 5 ثوانٍ.
 */

export type LiveStatus = "connecting" | "live" | "offline" | "disabled";

interface LiveState {
  status: LiveStatus;
  /** آخر لحظة وصلت فيها قراءة لكل بوابة (للنبضة المرئية) */
  pulses: Record<string, number>;
  freshMovements: ReadonlySet<string>;
  freshAlerts: ReadonlySet<string>;
}

const LiveContext = createContext<LiveState>({
  status: "connecting",
  pulses: {},
  freshMovements: new Set(),
  freshAlerts: new Set(),
});

export const useLive = () => useContext(LiveContext);

/** فترة التحديث الاحتياطي حسب حالة الاتصال اللحظي */
export function usePollInterval(): number | false {
  const { status } = useLive();
  return status === "live" ? 60_000 : 5_000;
}

const FRESH_MS = 1_800;

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [freshMovements, setFreshMovements] = useState<ReadonlySet<string>>(new Set());
  const [freshAlerts, setFreshAlerts] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Set<string>());
  /** إشعارات التنبيهات الحرجة الظاهرة الآن (تتحدث لو تجمّعت قطع أكثر في نفس الحادثة) */
  const openToasts = useRef(new Set<string>());
  const timer = useRef<number | undefined>(undefined);

  const invalidate = useCallback(
    (keys: string[]) => {
      for (const k of keys) pending.current.add(k);
      if (timer.current !== undefined) return;
      timer.current = window.setTimeout(() => {
        const batch = [...pending.current];
        pending.current.clear();
        timer.current = undefined;
        for (const key of batch) void queryClient.invalidateQueries({ queryKey: [key] });
      }, 120);
    },
    [queryClient],
  );

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setStatus("disabled");
      return;
    }

    const markFresh = (set: typeof setFreshMovements, id: string) => {
      set((prev) => new Set(prev).add(id));
      window.setTimeout(
        () =>
          set((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          }),
        FRESH_MS,
      );
    };

    const channel = client
      .channel("makhzoon-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, (payload) => {
        const row = payload.new as { id?: string; gate_id?: string };
        if (row.gate_id) setPulses((p) => ({ ...p, [row.gate_id as string]: Date.now() }));
        if (payload.eventType === "INSERT" && row.id) markFresh(setFreshMovements, row.id);
        invalidate(["movements", "gates", "summary", "products", "product"]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (payload) => {
        const row = payload.new as { id?: string; severity?: string; status?: string; title?: string; body?: string | null };
        const id = row.id;
        if (payload.eventType === "INSERT" && id) {
          markFresh(setFreshAlerts, id);
          // التنبيه الحرج يظهر كإشعار منبثق
          if (row.severity === "critical" && row.title) {
            openToasts.current.add(id);
            const forget = () => openToasts.current.delete(id);
            toast.error(row.title, {
              id,
              description: row.body ?? undefined,
              duration: 9000,
              onDismiss: forget,
              onAutoClose: forget,
            });
          }
        } else if (payload.eventType === "UPDATE" && id && openToasts.current.has(id) && row.title) {
          if (row.status === "open") toast.error(row.title, { id, description: row.body ?? undefined });
          else {
            toast.dismiss(id);
            openToasts.current.delete(id);
          }
        }
        invalidate(["alerts", "summary", "gates", "products"]);
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live");
          // بعد أي انقطاع: اجلب الحالة الحالية لأن الأحداث اللي فاتت ما تُعاد
          invalidate(["movements", "gates", "summary", "products", "product", "alerts"]);
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [invalidate]);

  return (
    <LiveContext.Provider value={{ status, pulses, freshMovements, freshAlerts }}>{children}</LiveContext.Provider>
  );
}
