import { formatMoney } from "@/components/ReportLists";
import { formatBelgradeDateTime } from "@/lib/date";
import { formatTemperatureSlot } from "@/lib/temperature-slots";
import type { DailyRevenueReport, TemperatureReport } from "@/lib/types";

export function DailyRevenueTable({ reports, error }: { reports: DailyRevenueReport[]; error?: string }) {
  return (
    <AdminTable empty={reports.length === 0} error={error} title="Pazari">
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
            <Td>{formatBelgradeDateTime(report.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}

export function TemperatureTable({ reports, error }: { reports: TemperatureReport[]; error?: string }) {
  return (
    <AdminTable empty={reports.length === 0} error={error} title="Temperature">
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
            <Td>{formatTemperatureSlot(report.shift)}</Td>
            <Td>{report.device_name}</Td>
            <Td>{Number(report.temperature).toFixed(1)} °C</Td>
            <Td>{report.note ?? "-"}</Td>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}

function AdminTable({
  title,
  empty,
  error,
  children
}: {
  title: string;
  empty: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {empty ? (
        error ? null : <p className="py-4 text-sm text-slate-600">Nema unosa za izabrane filtere.</p>
      ) : (
        <div aria-label={title} className="mt-3 overflow-x-auto" role="region" tabIndex={0}>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">{children}</table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}
