"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAlerts } from "@/lib/client/queries";
import { formatTime } from "@/lib/format";
import { WAREHOUSE_NAME } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useLive, type LiveStatus } from "./live-provider";

const TABS = [
  { href: "/", label: "نظرة عامة", alerts: true },
  { href: "/gates", label: "بوابات RFID", alerts: false },
  { href: "/inventory", label: "المخزون", alerts: false },
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13M8.3 8.3a5 5 0 0 0 0 7.4M15.7 8.3a5 5 0 0 1 0 7.4" />
    </svg>
  );
}

const CONNECTION: Record<LiveStatus, { label: string; dot: string }> = {
  live: { label: "متصل لحظيًا", dot: "bg-ok animate-beat" },
  connecting: { label: "جارٍ الاتصال", dot: "bg-signal" },
  offline: { label: "انقطع البث · تحديث كل 5 ثوانٍ", dot: "bg-crit" },
  disabled: { label: "تحديث دوري كل 5 ثوانٍ", dot: "bg-muted-foreground" },
};

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="mono min-w-[64px] text-ink" aria-label="الوقت بتوقيت الرياض">
      {now ? formatTime(now) : "--:--:--"}
    </span>
  );
}

type Theme = "system" | "light" | "dark";
const THEME_NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_LABEL: Record<Theme, string> = { system: "حسب الجهاز", light: "فاتح", dark: "ليلي" };

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  const apply = (next: Theme) => {
    setTheme(next);
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("makhzoon-theme");
      else localStorage.setItem("makhzoon-theme", next);
    } catch {
      // التخزين المحلي غير متاح (تصفح خاص): الاختيار يبقى لهذه الجلسة فقط
    }
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => apply(THEME_NEXT[theme])}
      className="grid size-8 place-items-center rounded-md border border-line text-ink hover:border-brand"
      aria-label={`المظهر: ${THEME_LABEL[theme]}. اضغط للتبديل`}
      title={`المظهر: ${THEME_LABEL[theme]}`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const { status } = useLive();
  const alerts = useAlerts();
  const critical = alerts.data?.alerts.filter((a) => a.severity === "critical" && a.status === "open").length ?? 0;
  const connection = CONNECTION[status];

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-line bg-surface">
      <div className="gutter mx-auto max-w-[1240px] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 flex-none place-items-center rounded-[10px] bg-brand text-brand-ink">
              <Logo className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[22px] font-bold leading-tight">مخزون حي</span>
              <span className="block text-[13px] text-muted-foreground">جرد لحظي بتقنية RFID مع تنبؤ ذكي بالطلب</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5" role="status">
              <span aria-hidden className={cn("size-[9px] rounded-full", connection.dot)} />
              {connection.label}
            </span>
            <span aria-hidden>·</span>
            <span>{WAREHOUSE_NAME}</span>
            <Clock />
            <span className="rounded-full border border-dashed border-line px-2.5 text-xs">بيانات تجريبية</span>
            <ThemeToggle />
          </div>
        </div>
        <nav className="scrollbar-none mt-2.5 flex gap-1 overflow-x-auto" aria-label="أقسام المنصة">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-none items-center border-b-[3px] px-3 pb-2.5 pt-2 text-sm font-medium",
                  active ? "border-brand font-semibold text-ink" : "border-transparent text-muted-foreground hover:text-ink",
                )}
              >
                {tab.label}
                {tab.alerts && critical > 0 ? (
                  <span
                    className="ms-1.5 min-w-[18px] rounded-full bg-crit px-1.5 text-center text-[11px] leading-[18px] text-white"
                    aria-label={`${critical} تنبيه حرج`}
                  >
                    {critical}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
