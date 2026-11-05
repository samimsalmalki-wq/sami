import type { Metadata } from "next";
import { InventoryView } from "@/components/views/inventory";

export const metadata: Metadata = { title: "المخزون · مخزون حي" };

export default function InventoryPage() {
  return <InventoryView />;
}
