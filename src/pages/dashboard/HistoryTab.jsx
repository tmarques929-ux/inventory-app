export default function HistoryTab({ historyError, stockHistory }) {
  const entries = Array.isArray(stockHistory) ? stockHistory : [];

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Historico de movimentacao</h2>
            <p className="text-sm text-slate-500">
              Registros de entradas e saidas realizadas manualmente neste painel.
            </p>
          </div>
        </div>

        {historyError ? (
          <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            Erro ao carregar historico: {historyError.message}
          </p>
        ) : entries.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Ainda nao ha movimentacoes registradas. Utilize os botoes de adicionar ou
            remover estoque para registrar a primeira movimentacao.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Data e horario
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Movimento
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Componente
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Quantidade
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Estoque apos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="bg-white">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.created_at
                        ? new Date(entry.created_at).toLocaleString("pt-BR")
                        : "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm font-medium ${
                        entry.action === "add" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {entry.action === "add" ? "Entrada" : "Saida"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {entry.component_code ? `${entry.component_code} - ` : ""}
                      {entry.component_name}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {Number(entry.quantity ?? 0).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {Number(entry.resulting_quantity ?? 0).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

HistoryTab.defaultProps = {
  historyError: null,
};
