import type { Metadata } from "next";
import { ProductDetailView } from "@/components/views/product-detail";

export const metadata: Metadata = { title: "تفاصيل الصنف · مخزون حي" };

export default function ProductPage({ params }: { params: { id: string } }) {
  return <ProductDetailView id={params.id} />;
}
