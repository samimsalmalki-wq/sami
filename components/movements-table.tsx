"use client";

import Link from "next/link";
import type { MovementItem } from "@/lib/api-types";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLive } from "./live-provider";
import { EmptyRow } from "./query-state";
import { DirectionLabel, MovementReference } from "./status";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

/** سجل القراءات: الوقت، EPC، الصنف، البوابة، الاتجاه، الكمية، المرجع (PO أو SO أو «غير مصرح») */
export function MovementsTable({
  movements,
  loading,
  showProduct = true,
  empty = "لا توجد قراءات بعد.",
  className,
}: {
  movements: MovementItem[] | undefined;
  loading?: boolean;
  showProduct?: boolean;
  empty?: string;
  className?: string;
}) {
  const { freshMovements } = useLive();
  const columns = showProduct ? 7 : 6;
  return (
    <div className={cn("max-h-[420px] overflow-auto rounded-md", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الوقت</TableHead>
            <TableHead>رقم البطاقة (EPC)</TableHead>
            {showProduct ? <TableHead>الصنف</TableHead> : null}
            <TableHead>البوابة</TableHead>
            <TableHead>الاتجاه</TableHead>
            <TableHead>الكمية</TableHead>
            <TableHead>المرجع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !movements
            ? Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {movements && movements.length === 0 ? <EmptyRow colSpan={columns}>{empty}</EmptyRow> : null}
          {movements?.map((m) => (
            <TableRow key={m.id} className={cn(freshMovements.has(m.id) && "flash-row")}>
              <TableCell className="mono text-[13px]">{formatWhen(m.created_at)}</TableCell>
              <TableCell className="mono text-[13px]">{m.epc}</TableCell>
              {showProduct ? (
                <TableCell>
                  <Link href={`/inventory/${m.product.id}`} className="hover:underline">
                    {m.product.name_ar}
                  </Link>
                </TableCell>
              ) : null}
              <TableCell>{m.gate.name_ar}</TableCell>
              <TableCell>
                <DirectionLabel direction={m.direction} />
              </TableCell>
              <TableCell className="num">{m.units}</TableCell>
              <TableCell>
                <MovementReference movement={m} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
