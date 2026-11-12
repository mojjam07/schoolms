import { Badge } from "./ui";
import type { InvoiceRow } from "../lib/types";

export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  pos: "POS",
  paystack: "Paystack",
  other: "Other",
};

export function InvoiceStatus({
  i,
}: {
  i: Pick<InvoiceRow, "status" | "overdue">;
}) {
  if (i.status === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  if (i.status === "paid") return <Badge tone="good">Paid</Badge>;
  return (
    <>
      <Badge tone={i.status === "part_paid" ? "warn" : "neutral"}>
        {i.status === "part_paid" ? "Part paid" : "Unpaid"}
      </Badge>
      {i.overdue && (
        <>
          {" "}
          <Badge tone="bad">Overdue</Badge>
        </>
      )}
    </>
  );
}
