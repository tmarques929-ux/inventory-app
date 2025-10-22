import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const RECEIVED_STATUSES = new Set(["recebido", "confirmado"]);
const PAID_STATUSES = new Set(["pago", "paga", "liquidado"]);

const parseDateParts = (value, fallback) => {
  const source = value || fallback;
  if (!source) return null;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
};

const formatMonthLabel = (year, month) => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const formatYearLabel = (year) => year.toString();

const buildEmptyFinancialBucket = () => ({
  received: 0,
  paid: 0,
});

const computeFinancialSummaries = (entries) => {
  const monthlyMap = new Map();
  const annualMap = new Map();

  entries.forEach((entry) => {
    const tipo = (entry.tipo ?? "").toLowerCase();
    const status = (entry.status ?? "").toLowerCase();
    const amount =
      Number(entry.valor_parcela ?? entry.valor ?? entry.valor_total ?? 0) || 0;
    if (amount <= 0) return;

    let bucketType = null;
    if (tipo === "receber" && RECEIVED_STATUSES.has(status)) {
      bucketType = "received";
    } else if (tipo === "pagar" && PAID_STATUSES.has(status)) {
      bucketType = "paid";
    } else {
      return;
    }

    const parts =
      parseDateParts(entry.data_prevista, entry.data_emissao) ??
      parseDateParts(entry.created_at);
    if (!parts) return;

    const monthKey = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    const annualKey = parts.year;

    const monthBucket =
      monthlyMap.get(monthKey) ?? monthlyMap.set(monthKey, buildEmptyFinancialBucket()).get(monthKey);
    monthBucket[bucketType] += amount;

    const annualBucket =
      annualMap.get(annualKey) ?? annualMap.set(annualKey, buildEmptyFinancialBucket()).get(annualKey);
    annualBucket[bucketType] += amount;
  });

  const monthly = Array.from(monthlyMap.entries())
    .map(([key, stats]) => {
      const [year, month] = key.split("-").map((part) => Number(part));
      return {
        key,
        label: formatMonthLabel(year, month),
        year,
        month,
        received: Number(stats.received.toFixed(2)),
        paid: Number(stats.paid.toFixed(2)),
      };
    })
    .map((row) => ({
      ...row,
      balance: Number((row.received - row.paid).toFixed(2)),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));

  const annual = Array.from(annualMap.entries())
    .map(([year, stats]) => ({
      key: `${year}`,
      label: formatYearLabel(year),
      year: Number(year),
      received: Number(stats.received.toFixed(2)),
      paid: Number(stats.paid.toFixed(2)),
    }))
    .map((row) => ({
      ...row,
      balance: Number((row.received - row.paid).toFixed(2)),
    }))
    .sort((a, b) => b.year - a.year);

  return { monthly, annual };
};

const computeNfeSummaries = (orders) => {
  const monthlyMap = new Map();
  const annualMap = new Map();

  orders.forEach((order) => {
    const amount = Number(order.valor ?? 0) || 0;
    if (amount <= 0) return;

    const parts =
      parseDateParts(order.data_pedido, order.created_at) ?? parseDateParts(order.created_at);
    if (!parts) return;

    const monthKey = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    const annualKey = parts.year;

    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + amount);
    annualMap.set(annualKey, (annualMap.get(annualKey) || 0) + amount);
  });

  const monthly = Array.from(monthlyMap.entries())
    .map(([key, total]) => {
      const [year, month] = key.split("-").map((part) => Number(part));
      return {
        key,
        label: formatMonthLabel(year, month),
        year,
        month,
        total: Number(total.toFixed(2)),
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));

  const annual = Array.from(annualMap.entries())
    .map(([year, total]) => ({
      key: `${year}`,
      label: formatYearLabel(year),
      year: Number(year),
      total: Number(total.toFixed(2)),
    }))
    .sort((a, b) => b.year - a.year);

  return { monthly, annual };
};

export default function ReportsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [financialEntries, setFinancialEntries] = useState([]);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    let isActive = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: agendaRows, error: agendaError }, { data: orderRows, error: ordersError }] =
          await Promise.all([
            supabase.from("agenda_financeira").select("*"),
            supabase.from("pedidos").select("*"),
          ]);
        if (agendaError) throw agendaError;
        if (ordersError) throw ordersError;
        if (!isActive) return;
        setFinancialEntries(Array.isArray(agendaRows) ? agendaRows : []);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
        setError(null);
      } catch (err) {
        console.error("Erro ao carregar dados para relatorios", err);
        if (isActive) setError(err);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    fetchData();
    return () => {
      isActive = false;
    };
  }, []);

  const summaries = useMemo(() => {
    const financial = computeFinancialSummaries(financialEntries);
    const nfe = computeNfeSummaries(orders);

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentYear = now.getFullYear();

    const currentFinancialMonthly =
      financial.monthly.find((row) => row.key === currentMonthKey) ??
      { received: 0, paid: 0, balance: 0 };
    const currentFinancialAnnual =
      financial.annual.find((row) => row.year === currentYear) ?? { received: 0, paid: 0, balance: 0 };
    const currentNfeMonthly =
      nfe.monthly.find((row) => row.key === currentMonthKey) ?? { total: 0 };
    const currentNfeAnnual =
      nfe.annual.find((row) => row.year === currentYear) ?? { total: 0 };

    return {
      financial,
      nfe,
      highlights: {
        currentMonth: {
          received: currentFinancialMonthly.received,
          paid: currentFinancialMonthly.paid,
          balance: currentFinancialMonthly.balance,
          nfe: currentNfeMonthly.total,
        },
        currentYear: {
          received: currentFinancialAnnual.received,
          paid: currentFinancialAnnual.paid,
          balance: currentFinancialAnnual.balance,
          nfe: currentNfeAnnual.total,
        },
      },
    };
  }, [financialEntries, orders]);

  if (loading) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Carregando relatórios...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <p className="text-sm text-rose-600">
          Não foi possível carregar os dados de relatórios: {error.message}
        </p>
      </section>
    );
  }

  const hasFinancialData =
    summaries.financial.monthly.length > 0 || summaries.financial.annual.length > 0;
  const hasNfeData = summaries.nfe.monthly.length > 0 || summaries.nfe.annual.length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Resumo rápido</h2>
        <p className="text-sm text-slate-500">
          Valores consolidados com base na agenda financeira e nas NF-es registradas.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Recebido (mês atual)
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-600">
              {formatCurrency(summaries.highlights.currentMonth.received)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Pago (mês atual)
            </p>
            <p className="mt-2 text-2xl font-semibold text-rose-600">
              {formatCurrency(summaries.highlights.currentMonth.paid)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              NF-es (mês atual)
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-700">
              {formatCurrency(summaries.highlights.currentMonth.nfe)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Saldo mês atual
            </p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                summaries.highlights.currentMonth.balance >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            >
              {formatCurrency(summaries.highlights.currentMonth.balance)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Recebido (ano atual)
            </p>
            <p className="mt-2 text-xl font-semibold text-emerald-600">
              {formatCurrency(summaries.highlights.currentYear.received)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              NF-es (ano atual)
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-700">
              {formatCurrency(summaries.highlights.currentYear.nfe)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Use este valor como referência para declarar vendas do ano em andamento.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Agenda financeira — resumo mensal</h2>
        {!hasFinancialData ? (
          <p className="mt-3 text-sm text-slate-500">
            Nenhum lançamento com status pago/recebido foi encontrado. Registre pagamentos e recebimentos na agenda financeira para visualizar os relatórios.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Mês</th>
                  <th className="px-4 py-2 text-right">Recebido</th>
                  <th className="px-4 py-2 text-right">Pago</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {summaries.financial.monthly.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 text-slate-600 capitalize">{row.label}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">
                      {formatCurrency(row.received)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">
                      {formatCurrency(row.paid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        row.balance >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Agenda financeira — resumo anual</h2>
        {!hasFinancialData ? (
          <p className="mt-3 text-sm text-slate-500">
            Cadastre novos pagamentos ou recebimentos para gerar o consolidado anual.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ano</th>
                  <th className="px-4 py-2 text-right">Recebido</th>
                  <th className="px-4 py-2 text-right">Pago</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {summaries.financial.annual.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 text-slate-600">{row.label}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">
                      {formatCurrency(row.received)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">
                      {formatCurrency(row.paid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        row.balance >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">NF-es — valores declarados</h2>
        {!hasNfeData ? (
          <p className="mt-3 text-sm text-slate-500">
            Nenhum pedido com NF-e foi localizado. Cadastre pedidos na tela “Pedidos” para gerar este relatório.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Mês</th>
                    <th className="px-4 py-2 text-right">Total NF-es</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {summaries.nfe.monthly.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3 text-slate-600 capitalize">{row.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Ano</th>
                    <th className="px-4 py-2 text-right">Total NF-es</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {summaries.nfe.annual.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3 text-slate-600">{row.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
