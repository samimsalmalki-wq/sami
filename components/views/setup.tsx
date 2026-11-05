"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { ApiError, getJson, sendJson } from "@/lib/client/api";
import { formatNumber } from "@/lib/format";
import type { SeedSummary } from "@/lib/server/seed";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { ViewHeader } from "../view-header";

interface SetupStatus {
  database_configured: boolean;
  setup_enabled: boolean;
  connected: boolean;
  migrated: boolean;
  products: number;
}

interface SetupResult {
  ok: boolean;
  migrations: string[];
  seed: SeedSummary;
}

const ERRORS: Record<string, string> = {
  invalid_token: "رمز التهيئة غير صحيح.",
  setup_disabled: "التهيئة مقفلة: أضف SETUP_TOKEN في متغيرات البيئة ثم أعد النشر.",
  database_not_configured: "أضف DATABASE_URL في متغيرات البيئة ثم أعد النشر.",
};

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <li className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
      <Icon className={cn("mt-0.5 size-4 flex-none", ok ? "text-ok" : "text-crit")} aria-hidden />
      <span>
        <b className="font-semibold">{label}</b>
        <span className="block text-[13px] text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

/** تهيئة المنصة بعد النشر: المخطط + البيانات التجريبية، وإعادتها قبل كل عرض */
export function SetupView() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["setup"], queryFn: () => getJson<SetupStatus>("/api/setup") });
  const [token, setToken] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const s = status.data;

  const run = async () => {
    const message = s?.products
      ? "سيُمسح كل ما في قاعدة البيانات الآن وتُعاد البيانات التجريبية. متأكد؟"
      : "سيُنشأ المخطط وتُعبأ البيانات التجريبية. متابعة؟";
    if (!window.confirm(message)) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await sendJson<SetupResult>("/api/setup", "POST", { token }));
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? (ERRORS[err.code] ?? `تعذرت التهيئة (${err.code}).`) : "تعذر الاتصال بالخادم.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <ViewHeader
        title="تهيئة المنصة"
        description="تجهّز قاعدة البيانات (الجداول والبث اللحظي) وتعبّئ البيانات التجريبية. استخدمها مرة بعد النشر، وقبل كل عرض لإرجاع البيانات لحالتها الأولى."
      />

      <Card>
        <CardHeader title="الحالة" />
        {s ? (
          <ul>
            <Check
              ok={s.database_configured && s.connected}
              label="قاعدة البيانات"
              detail={!s.database_configured ? "أضف DATABASE_URL في متغيرات البيئة" : s.connected ? "متصلة" : "تعذر الاتصال، تحقق من رابط DATABASE_URL وكلمة المرور"}
            />
            <Check ok={s.migrated} label="المخطط" detail={s.migrated ? "الجداول موجودة" : "لم يُطبّق بعد"} />
            <Check
              ok={s.products > 0}
              label="البيانات التجريبية"
              detail={s.products > 0 ? `${formatNumber(s.products)} صنف` : "فاضية"}
            />
            <Check
              ok={s.setup_enabled}
              label="رمز التهيئة"
              detail={s.setup_enabled ? "مفعّل" : "أضف SETUP_TOKEN في متغيرات البيئة ثم أعد النشر"}
            />
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">جارٍ الفحص…</p>
        )}
      </Card>

      <Card>
        <CardHeader title={s?.products ? "إعادة البيانات التجريبية" : "تهيئة قاعدة البيانات"} />
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            رمز التهيئة (SETUP_TOKEN)
            <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
          </label>
          <p className="text-[13px] text-muted-foreground">يمسح كل البيانات الحالية ويعيد البيانات التجريبية من البداية.</p>
          <div>
            <Button type="submit" disabled={running || !token || !s?.setup_enabled}>
              {running ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {s?.products ? "إعادة البيانات التجريبية" : "تهيئة وتعبئة البيانات التجريبية"}
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-crit-soft px-3 py-2 text-sm text-crit-ink">
            {error}
          </p>
        ) : null}
        {result ? (
          <div role="status" className="mt-3 rounded-md bg-ok-soft px-3 py-2.5 text-sm text-ok-ink">
            <b className="font-semibold">تمت التهيئة.</b>{" "}
            {result.migrations.length ? `طُبّق المخطط (${result.migrations.length} ملف). ` : "المخطط محدّث. "}
            {formatNumber(result.seed.products)} صنف · {formatNumber(result.seed.batches)} دفعة · {formatNumber(result.seed.tags)} بطاقة ·{" "}
            {formatNumber(result.seed.alerts)} تنبيه.{" "}
            <Link href="/" className="font-semibold underline">
              افتح نظرة عامة
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
