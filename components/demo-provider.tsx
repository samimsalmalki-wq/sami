"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendJson } from "@/lib/client/api";
import type { ScenarioName, ScenarioResult } from "@/lib/simulator/scenarios";

/** أزرار سيناريوهات العرض والحركة المستمرة. الحالة على مستوى التطبيق فتستمر الحركة عند التنقل بين الشاشات */

type Scenario = Exclude<ScenarioName, "live_step">;

interface DemoState {
  enabled: boolean;
  running: Scenario | null;
  live: boolean;
  run: (scenario: Scenario) => Promise<void>;
  toggleLive: () => void;
}

const DemoContext = createContext<DemoState>({
  enabled: false,
  running: null,
  live: false,
  run: async () => {},
  toggleLive: () => {},
});

export const useDemo = () => useContext(DemoContext);

const LIVE_INTERVAL_MS = 1_500;

export function DemoProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [running, setRunning] = useState<Scenario | null>(null);
  const [live, setLive] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async (scenario: Scenario) => {
      if (running) return;
      setRunning(scenario);
      try {
        const result = await sendJson<ScenarioResult>("/api/simulator", "POST", { scenario });
        if (result.ok) toast.success(result.message);
        else toast.warning(result.message);
      } catch {
        toast.error("تعذر تشغيل السيناريو. تأكد أن SIMULATOR_ENABLED=true وأن قاعدة البيانات متصلة.");
      } finally {
        setRunning(null);
      }
    },
    [running],
  );

  useEffect(() => {
    if (!live) return;
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await sendJson("/api/simulator", "POST", { scenario: "live_step" });
      } catch {
        setLive(false);
        toast.error("توقفت الحركة المستمرة: تعذر الوصول للمحاكي.");
      } finally {
        inFlight.current = false;
      }
    };
    void tick();
    const id = window.setInterval(tick, LIVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [live]);

  return (
    <DemoContext.Provider value={{ enabled, running, live, run, toggleLive: () => setLive((v) => !v) }}>
      {children}
    </DemoContext.Provider>
  );
}
