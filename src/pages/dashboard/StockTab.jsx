export default function StockTab({
  stockSearch,
  onStockSearchChange,
  onCreateStockItem,
  newItemCode,
  onNewItemCodeChange,
  newItemName,
  onNewItemNameChange,
  newItemQuantity,
  onNewItemQuantityChange,
  isCreatingItem,
  newItemDescription,
  onNewItemDescriptionChange,
  newItemLocation,
  onNewItemLocationChange,
  newItemPurchaseLot,
  onNewItemPurchaseLotChange,
  newItemMoq,
  onNewItemMoqChange,
  newItemFeedback,
  filteredStockItems,
  adjustItemId,
  onAdjustItemIdChange,
  adjustAmount,
  onAdjustAmountChange,
  onAdjustStock,
  isUpdatingStock,
  adjustFeedback,
  canManageStock = true,
}) {
  const stockItems = Array.isArray(filteredStockItems) ? filteredStockItems : [];
  const feedback = newItemFeedback ?? { type: "", message: "" };
  const adjustStatus = adjustFeedback ?? { type: "", message: "" };
  const restricted = !canManageStock;

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Estoque cadastrado</h2>
            <p className="text-sm text-slate-500">Lista completa dos componentes.</p>
          </div>
          <input
            type="text"
            value={stockSearch}
            onChange={(event) => onStockSearchChange(event.target.value)}
            placeholder="Buscar por codigo, nome ou descricao..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-80"
          />
        </div>

        {restricted && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Voce possui acesso apenas para consulta. Solicite a um administrador para alterar o estoque.
          </p>
        )}

        <div className="mt-6 grid gap-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Novo componente
            </h4>
            <form
              onSubmit={onCreateStockItem}
              className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
            >
            <fieldset disabled={restricted} className="contents">
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Codigo
                <input
                  type="text"
                  value={newItemCode}
                  onChange={(event) => onNewItemCodeChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Opcional"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Nome
                <input
                  type="text"
                  value={newItemName}
                  onChange={(event) => onNewItemNameChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Ex: Resistor 10k 1/4W"
                  required
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Quantidade inicial
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newItemQuantity}
                  onChange={(event) => onNewItemQuantityChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="0"
                />
              </label>
              <button
                type="submit"
                disabled={isCreatingItem}
                className="h-10 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 md:h-auto md:self-end"
              >
                {isCreatingItem ? "Salvando..." : "Adicionar ao estoque"}
              </button>
              <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2">
                Lote de compra (múltiplo)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newItemPurchaseLot}
                  onChange={(event) => onNewItemPurchaseLotChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Opcional — ex: 5000"
                />
                <span className="mt-1 text-xs text-slate-400">
                  Informe o múltiplo de compra. Deixe em branco para considerar 1.
                </span>
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2">
                Quantidade mínima (MOQ)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newItemMoq}
                  onChange={(event) => onNewItemMoqChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Opcional"
                />
                <span className="mt-1 text-xs text-slate-400">
                  Quantidade mínima exigida pelo fornecedor.
                </span>
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2">
                Descricao (opcional)
                <input
                  type="text"
                  value={newItemDescription}
                  onChange={(event) => onNewItemDescriptionChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Detalhes para identificar o componente"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2">
                Localizacao (opcional)
                <input
                  type="text"
                  value={newItemLocation}
                  onChange={(event) => onNewItemLocationChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Ex: Gaveta A3"
                />
              </label>
            </fieldset>
            </form>
            {feedback.type && (
              <p
                className={`mt-3 text-sm ${
                  feedback.type === "error" ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {feedback.message}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Ajustar estoque existente
            </h4>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onAdjustStock("add");
              }}
              className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] md:items-end"
            >
              <fieldset disabled={restricted} className="contents">
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Componente
                  <select
                    value={adjustItemId}
                    onChange={(event) => onAdjustItemIdChange(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value="">Selecione um componente</option>
                    {stockItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code ? `${item.code} - ` : ""}
                        {item.name} (Atual: {item.quantity ?? 0})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Quantidade
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={adjustAmount}
                    onChange={(event) => onAdjustAmountChange(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isUpdatingStock}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdatingStock ? "Atualizando..." : "Adicionar"}
                </button>
                <button
                  type="button"
                  onClick={() => onAdjustStock("remove")}
                  disabled={isUpdatingStock}
                  className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remover
                </button>
              </fieldset>
            </form>
            {adjustStatus.type && (
              <p
                className={`mt-3 text-sm ${
                  adjustStatus.type === "error" ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {adjustStatus.message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Codigo
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Componente
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Descricao
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quantidade
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Lote compra
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  MOQ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockItems.map((item, index) => (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-sky-50/40"}>
                  <td className="px-4 py-3 text-sm font-mono text-slate-700">
                    {item.code || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.description?.trim() ? item.description : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {item.quantity?.toLocaleString("pt-BR") ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {item.purchaseLot
                      ? item.purchaseLot.toLocaleString("pt-BR")
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {item.minimumOrderQuantity
                      ? item.minimumOrderQuantity.toLocaleString("pt-BR")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

StockTab.defaultProps = {
  newItemFeedback: { type: "", message: "" },
  adjustFeedback: { type: "", message: "" },
  newItemPurchaseLot: "",
  onNewItemPurchaseLotChange: () => {},
  newItemMoq: "",
  onNewItemMoqChange: () => {},
};







