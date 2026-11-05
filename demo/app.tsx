import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Providers } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { GatesView } from "@/components/views/gates";
import { InventoryView } from "@/components/views/inventory";
import { OverviewView } from "@/components/views/overview";
import { ProductDetailView } from "@/components/views/product-detail";
import { resetDemoData } from "./runtime";
import { usePathname } from "./shims/next-navigation";

function Routes() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);
  if (path === "/gates") return <GatesView />;
  if (path === "/inventory") return <InventoryView />;
  const product = path.match(/^\/inventory\/(.+)$/);
  if (product?.[1]) return <ProductDetailView key={product[1]} id={product[1]} />;
  return <OverviewView />;
}

/** توضيح أن النسخة تعمل داخل المتصفح، وزر إرجاع البيانات بتأكيد داخل الصفحة */
function BrowserNotice() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const reset = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await resetDemoData();
      await queryClient.invalidateQueries();
      toast.success("رجعت البيانات التجريبية لحالتها الأولى");
    } catch {
      toast.error("تعذرت إعادة البيانات، حدّث الصفحة لتبدأ من جديد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-muted-foreground">
      <p className="min-w-0 flex-1 basis-64">
        هذه النسخة تعمل بالكامل داخل متصفحك: قاعدة بيانات Postgres داخل الصفحة مع نفس خادم الاستقبال والقواعد
        والمحاكي. كل جهاز يشغّل نسخته الخاصة، وتحديث الصفحة يرجع البيانات من البداية.
      </p>
      <Button size="xs" variant={confirming ? "default" : "outline"} onClick={() => void reset()} disabled={busy}>
        {busy ? "جارٍ الإعادة…" : confirming ? "اضغط مرة ثانية للتأكيد" : "إعادة البيانات التجريبية"}
      </Button>
    </div>
  );
}

export function DemoApp() {
  return (
    <Providers simulatorEnabled>
      <AppHeader />
      <main className="gutter mx-auto max-w-[1240px] pb-12 pt-5">
        <BrowserNotice />
        <Routes />
      </main>
    </Providers>
  );
}
