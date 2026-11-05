"use client";

import { Toaster as Sonner } from "sonner";

/** الإشعارات المنبثقة: التنبيه الحرج ونتائج سيناريوهات العرض */
export function Toaster() {
  return (
    <Sonner
      dir="rtl"
      position="bottom-center"
      visibleToasts={4}
      duration={6000}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "pointer-events-auto flex w-[min(440px,calc(100vw-32px))] items-start gap-2.5 rounded-[10px] bg-ink px-3.5 py-2.5 text-sm text-background shadow-lg",
          title: "font-semibold",
          description: "mt-0.5 text-[13px] opacity-80",
          icon: "mt-1 flex size-4 flex-none items-center justify-center",
        },
      }}
      icons={{
        success: <span className="size-2 rounded-full bg-ok" />,
        info: <span className="size-2 rounded-full bg-brand" />,
        warning: <span className="size-2 rounded-full bg-warn" />,
        error: <span className="size-2 rounded-full bg-crit" />,
      }}
    />
  );
}
