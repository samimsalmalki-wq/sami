import type { Metadata } from "next";
import { GatesView } from "@/components/views/gates";

export const metadata: Metadata = { title: "بوابات RFID · مخزون حي" };

export default function GatesPage() {
  return <GatesView />;
}
