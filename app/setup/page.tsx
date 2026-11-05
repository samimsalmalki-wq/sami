import type { Metadata } from "next";
import { SetupView } from "@/components/views/setup";

export const metadata: Metadata = { title: "تهيئة المنصة · مخزون حي" };

export default function SetupPage() {
  return <SetupView />;
}
