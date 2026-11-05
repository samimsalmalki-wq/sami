import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-2 py-10">
      <h2 className="font-display text-xl font-medium">الصفحة غير موجودة</h2>
      <Link href="/" className="text-sm text-brand hover:underline">
        العودة إلى نظرة عامة
      </Link>
    </div>
  );
}
