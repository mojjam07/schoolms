import { Link, useParams } from "react-router-dom";
import { Alert, Button, Card, DataState } from "../components/ui";
import DownloadPdfButton from "../components/DownloadPdfButton";
import { METHOD_LABEL } from "../components/FeeBits";
import { fmtDateTime, naira } from "../lib/format";
import type { Receipt } from "../lib/types";
import { useFetch } from "../lib/useFetch";

// Only the school details the school itself supplied are printed here. Phone and email will be added once provided.
const SCHOOL = {
  name: "[School Name]",
  address: "[School Address]",
};

export default function ReceiptPage({ backTo }: { backTo: string }) {
  const { id = "" } = useParams();
  const r = useFetch<Receipt>(`/fees/payments/${id}/receipt`);
  const d = r.data;
  const rows: [string, string][] = d
    ? [
        ["Receipt number", d.receiptNumber],
        ["Date received", fmtDateTime(d.paidAt)],
        [
          "Student",
          `${d.studentName}${d.admissionNumber ? ` (${d.admissionNumber})` : ""}`,
        ],
        ["Class", d.className],
        ["For", `${d.sessionName} ${d.termName} school fees`],
        ["Invoice", d.invoiceNumber],
        ["Paid by", METHOD_LABEL[d.method] ?? d.method],
        ...(d.reference
          ? [["Reference", d.reference] as [string, string]]
          : []),
      ]
    : [];
  return (
    <>
      <p className="no-print mb-3 text-sm">
        <Link className="font-medium text-brand-700 underline" to={backTo}>
          Back
        </Link>
      </p>
      <DataState loading={r.loading} error={r.error}>
        {d && (
          <div className="max-w-xl">
            <Card>
              <div className="border-b-4 border-gold-400 pb-4 text-center">
                <p className="font-display text-2xl font-bold">{SCHOOL.name}</p>
                <p className="text-sm text-muted">{SCHOOL.address}</p>
                <p className="mt-3 text-lg font-semibold uppercase tracking-wide">
                  Payment receipt
                </p>
              </div>
              {d.reversed && (
                <div className="mt-4">
                  <Alert tone="error">
                    This payment was reversed and is no longer counted.
                  </Alert>
                </div>
              )}
              <dl className="mt-4 divide-y divide-line text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 rounded-lg bg-brand-50 p-4 text-center text-2xl font-bold">
                {naira(d.amountKobo)}
              </p>
              <p className="mt-3 text-center text-sm text-muted">
                Balance on this invoice: {naira(d.balanceKobo)} of{" "}
                {naira(d.invoiceTotalKobo)}
              </p>
            </Card>
            <div className="no-print mt-4 flex max-w-md flex-wrap items-center gap-3">
              <div className="max-w-xs">
                <Button onClick={() => window.print()}>Print receipt</Button>
              </div>
              {!d.reversed && (
                <DownloadPdfButton
                  path={`/pdf/receipts/${id}`}
                  filename={`receipt-${d.receiptNumber}.pdf`}
                  label="Download PDF"
                />
              )}
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
