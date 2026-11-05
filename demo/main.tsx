import "@/app/globals.css";
import "./demo.css";
import { createRoot } from "react-dom/client";
import { DemoApp } from "./app";
import { bootDatabase } from "./runtime";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";
try {
  const saved = localStorage.getItem("makhzoon-theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch {
  // التخزين المحلي غير متاح: نتبع مظهر الجهاز
}

const root = document.getElementById("app");
const status = document.getElementById("boot-status");
const bar = document.getElementById("boot-bar");

bootDatabase((message, progress) => {
  if (status) status.textContent = message;
  if (bar && progress !== undefined) bar.style.width = `${Math.round(progress * 100)}%`;
})
  .then(() => {
    if (root) createRoot(root).render(<DemoApp />);
  })
  .catch((err: unknown) => {
    console.error(err);
    const box = document.getElementById("boot");
    if (!box) return;
    box.classList.add("boot-failed");
    if (status) status.textContent = "تعذر تشغيل قاعدة البيانات داخل هذا المتصفح.";
    const detail = document.getElementById("boot-detail");
    if (detail) {
      detail.textContent = `جرّب متصفحًا حديثًا (Chrome أو Safari أو Edge) ثم حدّث الصفحة. التفاصيل: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
