import { TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/client/api";

/** رسالة خطأ مفهومة عند أول تشغيل (قاعدة البيانات غير معدّة مثلًا) */
export function QueryError({ error }: { error: unknown }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-crit/40 bg-crit-soft p-3.5 text-sm text-crit-ink">
      <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
      <div>
        <b className="font-semibold">{notFound ? "العنصر غير موجود" : "تعذر تحميل البيانات"}</b>
        {notFound ? null : (
          <p className="mt-0.5">
            تأكد من إعداد <span className="mono">DATABASE_URL</span> وتطبيق المخطط والبيانات التجريبية
            (<span className="mono">npm run db:reset</span>).
          </p>
        )}
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-2.5 py-4 text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
