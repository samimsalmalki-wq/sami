import * as React from "react";
import { cn } from "@/lib/utils";

/** الجداول تتمرر أفقيًا داخل حاويتها على الجوال */
export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

export const TableHeader = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;
export const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("[&_tr:last-child_td]:border-0", className)} {...props} />
);

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn("transition-colors", className)} {...props} />,
);
TableRow.displayName = "TableRow";

export const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      "whitespace-nowrap border-b border-line bg-sunk px-2.5 py-2 text-start text-xs font-semibold text-muted-foreground",
      className,
    )}
    {...props}
  />
);

export const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("whitespace-nowrap border-b border-line px-2.5 py-2.5 align-middle", className)} {...props} />
);
