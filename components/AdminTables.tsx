import { formatMoney } from "@/components/ReportLists";
import type { DailyRevenueReport, ProduceRequest, TemperatureReport } from "@/lib/types";

export function DailyRevenueTable({ reports, error }: { reports: DailyRevenueReport[]; error?: string }) {
  return (
    <AdminTable error={error} title="Pazari">
      <thead>
        <tr>
          <Th>Datum</Th>
          <Th>Radnja</Th>
          <Th>Smena</Th>
          <Th>Gotovina</Th>
          <Th>Ček</Th>
          <Th>Kartica</Th>
          <Th>Virman</Th>
          <Th>Ispravka</Th>
          <Th>eDopuna</Th>
          <Th>Ukupno</Th>
          <Th>Napomena</Th>
          <Th>Vreme slanja</Th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id}>
            <Td>{report.report_date}</Td>
            <Td>{report.stores?.name ?? "-"}</Td>
            <Td>{report.shift ?? "-"}</Td>
            <Td>{formatMoney(report.cash_revenue)}</Td>
            <Td>{formatMoney(report.check_revenue)}</Td>
            <Td>{formatMoney(report.card_revenue)}</Td>
            <Td>{formatMoney(report.bank_transfer_revenue)}</Td>
            <Td>{formatMoney(report.correction_revenue)}</Td>
            <Td>{formatMoney(report.edopuna_revenue)}</Td>
            <Td>{formatMoney(report.total_revenue)}</Td>
            <Td>{report.note ?? "-"}</Td>
            <Td>{formatDateTime(report.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}

export function TemperatureTable({ reports, error }: { reports: TemperatureReport[]; error?: string }) {
  return (
    <AdminTable error={error} title="Temperature">
      <thead>
        <tr>
          <Th>Datum</Th>
          <Th>Radnja</Th>
          <Th>Smena</Th>
          <Th>Naziv uređaja</Th>
          <Th>Temperatura</Th>
          <Th>Napomena</Th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id}>
            <Td>{report.report_date}</Td>
            <Td>{report.stores?.name ?? "-"}</Td>
            <Td>{report.shift ?? "-"}</Td>
            <Td>{report.device_name}</Td>
            <Td>{Number(report.temperature).toFixed(1)} °C</Td>
            <Td>{report.note ?? "-"}</Td>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}

export function ProduceRequestsTable({ requests, error }: { requests: ProduceRequest[]; error?: string }) {
  return (
    <AdminTable error={error} title="Trebovanja">
      <thead>
        <tr>
          <Th>Datum</Th>
          <Th>Radnja</Th>
          <Th>Naziv artikla</Th>
          <Th>Količina</Th>
          <Th>Jedinica mere</Th>
          <Th>Napomena</Th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => (
          <tr key={request.id}>
            <Td>{request.request_date}</Td>
            <Td>{request.stores?.name ?? "-"}</Td>
            <Td>{request.item_name}</Td>
            <Td>{request.quantity ?? "-"}</Td>
            <Td>{request.unit ?? "-"}</Td>
            <Td>{request.note ?? "-"}</Td>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}

function AdminTable({
  title,
  error,
  children
}: {
  title: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">{children}</table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
