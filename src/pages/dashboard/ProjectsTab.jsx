export default function ProjectsTab({
  projectOptions,
  selectedProjectId,
  onSelectProject,
  selectedProject,
  onProjectValueChange,
  onProjectCurrencyChange = () => {},
  projectValueSummary = { amount: 0, currency: "BRL", conversions: { BRL: 0, USD: 0 } },
  projectValueCurrency = "BRL",
  projectValueAmountInput = "",
  currencyOptions = ["BRL", "USD"],
  boardsToProduce,
  onBoardsToProduceChange,
  onGenerateReport,
  isEditingProject,
  onStartEditing,
  draftProject,
  editPanelRef,
  onDraftMetadataChange,
  onDraftComponentChange,
  onRemoveDraftComponent,
  onAddDraftComponent,
  onSaveProject,
  onCancelEditing,
  inventorySelectionItems,
  normalize,
  catalogWithAvailability,
  projectItems,
  generatedQuantity,
  onDownloadReport,
  onRemoveProjectItem,
  onSoftwareUpload = () => {},
  onRemoveSoftwareFile = () => {},
  onDownloadSoftware = () => {},
  isUploadingSoftware = false,
  softwareUploadStatus = { type: null, message: "" },
  onGerberUpload = () => {},
  onRemoveGerberFile = () => {},
  onDownloadGerber = () => {},
  isUploadingGerber = false,
  gerberUploadStatus = { type: null, message: "" },
  revisions = [],
  revisionsLoading = false,
  revisionsError = null,
  reservationsLoading = false,
  reservationsError = null,
  reservationStatus = { type: null, message: "" },
  reservationSummary = { totalReservations: 0, totalQuantity: 0, entries: [] },
  onFinalizeReservations = () => {},
  isFinalizingReservations = false,
  canEditProject = false,
}) {
  const metadata = selectedProject?.metadata ?? {};
  const effectiveProjectValueSummary = projectValueSummary ?? {
    amount: 0,
    currency: "BRL",
    conversions: { BRL: 0, USD: 0 },
  };
  const projectValueInputValue = isEditingProject
    ? projectValueAmountInput
    : String(effectiveProjectValueSummary.amount ?? 0);
  const selectedProjectCurrency = projectValueCurrency || effectiveProjectValueSummary.currency || "BRL";

  const formatCurrencyValue = (value, currency = "BRL") => {
    const numeric = Number(value);
    const safeAmount = Number.isFinite(numeric) ? numeric : 0;
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(safeAmount);
    } catch (_err) {
      return `${currency} ${safeAmount.toFixed(2)}`;
    }
  };
  const draftMetadata = draftProject?.metadata ?? {};
  const components = Array.isArray(draftProject?.components) ? draftProject.components : [];
  const selectionItems = Array.isArray(inventorySelectionItems) ? inventorySelectionItems : [];
  const catalog = Array.isArray(catalogWithAvailability) ? catalogWithAvailability : [];
  const generatedItems = Array.isArray(projectItems) ? projectItems : [];
  const softwareStatus = softwareUploadStatus || { type: null, message: "" };
  const gerberStatus = gerberUploadStatus || { type: null, message: "" };

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <label
          htmlFor="project-selector"
          className="block text-sm font-medium text-slate-600"
        >
          Projeto
        </label>
        <select
          id="project-selector"
          value={selectedProjectId}
          onChange={(event) => onSelectProject(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 md:w-80"
        >
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Projeto selecionado
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  {metadata.name}
                </h2>
                <p className="text-sm text-slate-500">
                  Cliente: {metadata.customer}. {metadata.notes}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Codigo placa pronta:{" "}
                  <span className="font-semibold text-slate-700">
                    {metadata.finishedBoardCode || "-"}
                  </span>
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Versao PCB:{" "}
                  <span className="font-semibold text-slate-700">
                    {metadata.pcbVersion || "-"}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Software:{" "}
                  <span className="font-semibold text-slate-700">
                    {metadata.softwareName || "-"}
                  </span>
                  {metadata.softwareFilePath && onDownloadSoftware ? (
                    <button
                      type="button"
                      onClick={() => onDownloadSoftware(metadata.softwareFilePath)}
                      className="ml-2 text-xs font-semibold text-sky-600 hover:underline"
                    >
                      Baixar
                    </button>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  Gerber:{" "}
                  <span className="font-semibold text-slate-700">
                    {metadata.gerberName || "-"}
                  </span>
                  {metadata.gerberFilePath && onDownloadGerber ? (
                    <button
                      type="button"
                      onClick={() => onDownloadGerber(metadata.gerberFilePath)}
                      className="ml-2 text-xs font-semibold text-sky-600 hover:underline"
                    >
                      Baixar
                    </button>
                  ) : null}
                </p>
              </div>
              <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Valor atual
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={projectValueInputValue}
                    onChange={onProjectValueChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-right text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-32"
                  />
                  <select
                    value={selectedProjectCurrency}
                    onChange={(event) => onProjectCurrencyChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-28"
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="mt-1 text-[10px] font-medium text-slate-400">
                  ≈ {formatCurrencyValue(effectiveProjectValueSummary.conversions.BRL, "BRL")} · ≈{" "}
                  {formatCurrencyValue(effectiveProjectValueSummary.conversions.USD, "USD")}
                </span>
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Quantidade de placas
              <input
                type="number"
                min="1"
                step="1"
                value={boardsToProduce}
                onChange={(event) => onBoardsToProduceChange(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-right text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 lg:w-28"
                placeholder="0"
              />
            </label>
            <button
              type="button"
              onClick={onGenerateReport}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
            >
              Gerar relatorio de compra
            </button>
{!isEditingProject && canEditProject && (
              <button
                type="button"
                onClick={onStartEditing}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Editar projeto
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Informe a quantidade de placas desejada e utilize o relatorio para calcular o que precisa ser comprado.
        </p>
        {reservationStatus?.message && (
          <p
            className={`mt-3 text-xs ${
              reservationStatus.type === "error"
                ? "text-rose-600"
                : reservationStatus.type === "success"
                ? "text-emerald-600"
                : "text-slate-500"
            }`}
          >
            {reservationStatus.message}
          </p>
        )}
        {reservationsError && (
          <p className="mt-3 text-xs text-rose-600">
            Nao foi possivel carregar reservas pendentes: {reservationsError.message}
          </p>
        )}
        {reservationsLoading ? (
          <p className="mt-3 text-xs text-slate-500">Carregando reservas pendentes...</p>
        ) : reservationSummary.totalQuantity > 0 ? (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <p>
              Reservados{" "}
              <span className="font-semibold">
                {reservationSummary.totalQuantity.toLocaleString("pt-BR")}
              </span>{" "}
              itens em {reservationSummary.totalReservations} registros para este projeto.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-sky-700">
              {reservationSummary.entries.map((entry) => (
                <li key={entry.itemId}>
                  <span className="font-semibold">
                    {entry.itemName}
                    {entry.itemCode ? ` (${entry.itemCode})` : ""}
                  </span>{" "}
                  — {entry.quantity.toLocaleString("pt-BR")} reservados
                </li>
              ))}
            </ul>
            {canEditProject && (
              <button
                type="button"
                onClick={onFinalizeReservations}
                disabled={isFinalizingReservations}
                className="mt-3 inline-flex items-center justify-center rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFinalizingReservations ? "Registrando consumo..." : "Consumir reservas"}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">
            Nenhuma reserva pendente para este projeto.
          </p>
        )}
        {!canEditProject && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Voce possui acesso apenas para consulta. Somente administradores podem editar o projeto.
          </p>
        )}

{canEditProject && isEditingProject && draftProject ? (
          <div
            ref={editPanelRef}
            className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6"
          >
            <h3 className="text-lg font-semibold text-slate-700">Editar projeto</h3>
            <p className="mt-1 text-sm text-slate-500">
              Ajuste os dados do projeto e a lista de componentes conforme necessario.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Nome do projeto
                <input
                  type="text"
                  value={draftMetadata.name ?? ""}
                  onChange={(event) => onDraftMetadataChange("name", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Cliente
                <input
                  type="text"
                  value={draftMetadata.customer ?? ""}
                  onChange={(event) => onDraftMetadataChange("customer", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Versao PCB
                <input
                  type="text"
                  value={draftMetadata.pcbVersion ?? ""}
                  onChange={(event) => onDraftMetadataChange("pcbVersion", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Nome do software
                <input
                  type="text"
                  value={draftMetadata.softwareName ?? ""}
                  onChange={(event) => onDraftMetadataChange("softwareName", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Nome do Gerber
                <input
                  type="text"
                  value={draftMetadata.gerberName ?? ""}
                  onChange={(event) => onDraftMetadataChange("gerberName", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <div className="flex flex-col text-sm font-medium text-slate-600 sm:col-span-2">
                Arquivo do software
                <input
                  type="file"
                  accept=".bin,.hex,.zip,.rar,.7z,.tar,.gz,.dfu,.img,.exe,.msi"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && onSoftwareUpload) {
                      onSoftwareUpload(file);
                    }
                    event.target.value = "";
                  }}
                  disabled={isUploadingSoftware}
                  className="mt-1 text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-700 hover:file:bg-sky-200"
                />
                {isUploadingSoftware && (
                  <p className="mt-2 text-xs text-slate-500">Enviando arquivo...</p>
                )}
                {softwareStatus.message && (
                  <p
                    className={`mt-2 text-xs ${
                      softwareStatus.type === "error" ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {softwareStatus.message}
                  </p>
                )}
                {draftMetadata.softwareFilePath && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <span className="truncate">
                      Arquivo atual: {draftMetadata.softwareFilePath}
                    </span>
                    <div className="flex gap-2">
                      {onDownloadSoftware && (
                        <button
                          type="button"
                          onClick={() => onDownloadSoftware(draftMetadata.softwareFilePath)}
                          className="font-semibold text-sky-600 hover:underline"
                        >
                          Baixar
                        </button>
                      )}
                      {onRemoveSoftwareFile && (
                        <button
                          type="button"
                          onClick={onRemoveSoftwareFile}
                          className="font-semibold text-rose-600 hover:underline"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col text-sm font-medium text-slate-600 sm:col-span-2">
                Arquivo Gerber
                <input
                  type="file"
                  accept=".zip,.rar,.7z,.tar,.gz,.ger,.gbr,.brd,.pcb,.gerber"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && onGerberUpload) {
                      onGerberUpload(file);
                    }
                    event.target.value = "";
                  }}
                  disabled={isUploadingGerber}
                  className="mt-1 text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-700 hover:file:bg-sky-200"
                />
                {isUploadingGerber && (
                  <p className="mt-2 text-xs text-slate-500">Enviando arquivo...</p>
                )}
                {gerberStatus.message && (
                  <p
                    className={`mt-2 text-xs ${
                      gerberStatus.type === "error" ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {gerberStatus.message}
                  </p>
                )}
                {draftMetadata.gerberFilePath && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <span className="truncate">
                      Gerber atual: {draftMetadata.gerberFilePath}
                    </span>
                    <div className="flex gap-2">
                      {onDownloadGerber && (
                        <button
                          type="button"
                          onClick={() => onDownloadGerber(draftMetadata.gerberFilePath)}
                          className="font-semibold text-sky-600 hover:underline"
                        >
                          Baixar
                        </button>
                      )}
                      {onRemoveGerberFile && (
                        <button
                          type="button"
                          onClick={onRemoveGerberFile}
                          className="font-semibold text-rose-600 hover:underline"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <label className="flex flex-col text-sm font-medium text-slate-600 sm:col-span-2">
                Notas
                <textarea
                  rows={3}
                  value={draftMetadata.notes ?? ""}
                  onChange={(event) => onDraftMetadataChange("notes", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 sm:col-span-2">
                Observacao
                <textarea
                  rows={2}
                  value={draftMetadata.observation ?? ""}
                  onChange={(event) => onDraftMetadataChange("observation", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Valor / codigo
                    </th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">
                      Qtd / placa
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Nomenclatura
                    </th>
                    <th className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-slate-500">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {components.map((component, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          list={`inventory-suggestions-${index}`}
                          value={component.value ?? ""}
                          onChange={(event) =>
                            onDraftComponentChange(index, "value", event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                        <datalist id={`inventory-suggestions-${index}`}>
                          {selectionItems
                            .filter((stockItem) => {
                              const typedValue = component.value ?? "";
                              const normalizedTyped = normalize(typedValue);
                              if (!normalizedTyped) return true;
                              const nameCandidate = normalize(stockItem.name);
                              return nameCandidate && nameCandidate.includes(normalizedTyped);
                            })
                            .slice(0, 25)
                            .map((stockItem) => (
                              <option
                                key={stockItem.id}
                                value={stockItem.name}
                                label={
                                  stockItem.code
                                    ? `${stockItem.name} (${stockItem.code})`
                                    : stockItem.name
                                }
                              />
                            ))}
                        </datalist>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={component.quantityPerAssembly ?? 0}
                          onChange={(event) =>
                            onDraftComponentChange(
                              index,
                              "quantityPerAssembly",
                              event.target.value,
                            )
                          }
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={component.nomenclature ?? ""}
                          onChange={(event) =>
                            onDraftComponentChange(index, "nomenclature", event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveDraftComponent(index)}
                          className="text-sm font-semibold text-rose-600 transition hover:text-rose-700"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onAddDraftComponent}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Adicionar componente
              </button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={onSaveProject}
                  className="inline-flex min-w-[160px] items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  Salvar alteracoes
                </button>
                <button
                  type="button"
                  onClick={onCancelEditing}
                  className="inline-flex min-w-[120px] items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Componente
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Disponivel
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qtd / placa
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nomenclatura
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catalog.map((entry) => (
                    <tr key={entry.catalogCode || entry.code || entry.value}>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800">
                          {entry.code ? `${entry.code} - ${entry.value}` : entry.value}
                        </div>
                        <div className="text-xs text-slate-500">
                          {entry.description || "Sem descricao"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {entry.available.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {entry.quantityPerAssembly?.toLocaleString("pt-BR") ?? 1}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {entry.nomenclature?.trim() ? entry.nomenclature : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {metadata.observation && (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                {metadata.observation}
              </p>
            )}
          </>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Historico de revisoes
          </h3>
          {revisionsLoading && (
            <span className="text-xs font-medium text-slate-500">Carregando...</span>
          )}
        </div>
        {revisionsError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            Nao foi possivel carregar as revisoes: {revisionsError.message}
          </p>
        ) : revisions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Nenhuma revisao registrada ainda para este projeto.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Revisao</th>
                  <th className="px-4 py-2 text-left">Criado em</th>
                  <th className="px-4 py-2 text-left">Autor</th>
                  <th className="px-4 py-2 text-left">Versao software</th>
                  <th className="px-4 py-2 text-left">Software</th>
                  <th className="px-4 py-2 text-left">Versao hardware</th>
                  <th className="px-4 py-2 text-left">Hardware</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revisions.map((revision) => (
                  <tr key={revision.id}>
                    <td className="px-4 py-2 font-semibold text-slate-700">#{revision.revision}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDateTime(revision.createdAt)}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {revision.createdByName?.trim() ||
                        revision.createdByEmail?.trim() ||
                        revision.createdById ||
                        "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {revision.softwareVersion?.trim() || "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {revision.softwarePath && onDownloadSoftware ? (
                        <button
                          type="button"
                          onClick={() => onDownloadSoftware(revision.softwarePath)}
                          className="text-sm font-semibold text-sky-600 hover:underline"
                        >
                          Baixar software
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {revision.hardwareVersion?.trim() || "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {revision.hardwarePath && onDownloadGerber ? (
                        <button
                          type="button"
                          onClick={() => onDownloadGerber(revision.hardwarePath)}
                          className="text-sm font-semibold text-sky-600 hover:underline"
                        >
                          Baixar hardware
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">
          Relatorio de compra para montagem
        </h3>
        {generatedItems.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Informe a quantidade de placas e clique em "Gerar relatorio de compra" para preencher esta tabela.
          </p>
        ) : (
          <>
            {generatedQuantity !== null && (
              <p className="mt-2 text-xs text-slate-500">
                Relatorio calculado para{" "}
                <span className="font-semibold text-slate-700">
                  {generatedQuantity.toLocaleString("pt-BR")}
                </span>{" "}
                placas.
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onDownloadReport}
                className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
              >
                Baixar PDF
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Componente
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Disponivel
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qtd / placa
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qtd necessaria
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Necessario comprar
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nomenclatura
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {generatedItems.map((entry) => {
                    const shortageValue = Number.isFinite(Number(entry.shortage))
                      ? Number(entry.shortage)
                      : Math.max(
                          0,
                          Number(entry.required ?? 0) - Number(entry.available ?? 0),
                        );
                    const lotLabel =
                      entry.purchaseLot > 1
                        ? `Lote ${entry.purchaseLot.toLocaleString("pt-BR")}`
                        : null;
                    const moqLabel =
                      entry.minimumOrderQuantity > 0 &&
                      entry.minimumOrderQuantity !== entry.purchaseLot
                        ? `MOQ ${entry.minimumOrderQuantity.toLocaleString("pt-BR")}`
                        : null;
                    const constraintLabel = [lotLabel, moqLabel].filter(Boolean).join(" · ");
                    return (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 text-sm font-medium text-slate-700">
                          {entry.code ? `${entry.code} - ${entry.name}` : entry.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {entry.available.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {entry.perBoard.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {entry.required.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div
                            className={`font-semibold ${
                              entry.toBuy > 0 ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {entry.toBuy.toLocaleString("pt-BR")}
                          </div>
                          {entry.toBuy > 0 && constraintLabel && (
                            <p className="mt-1 text-xs text-slate-400">
                              Falta {shortageValue.toLocaleString("pt-BR")} · {constraintLabel}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {entry.nomenclature?.trim() ? entry.nomenclature : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => onRemoveProjectItem(entry.id)}
                            className="text-sm font-medium text-rose-600 hover:underline"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
