export default function ProjectsTab({
  projectOptions,
  selectedProjectId,
  onSelectProject,
  selectedProject,
  onProjectValueChange,
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
  canEditProject = false,
}) {
  const metadata = selectedProject?.metadata ?? {};
  const draftMetadata = draftProject?.metadata ?? {};
  const components = Array.isArray(draftProject?.components) ? draftProject.components : [];
  const selectionItems = Array.isArray(inventorySelectionItems) ? inventorySelectionItems : [];
  const catalog = Array.isArray(catalogWithAvailability) ? catalogWithAvailability : [];
  const generatedItems = Array.isArray(projectItems) ? projectItems : [];

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
              </div>
              <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Valor atual (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    metadata.projectValue !== undefined && metadata.projectValue !== null
                      ? metadata.projectValue
                      : 0
                  }
                  onChange={onProjectValueChange}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-right text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 lg:w-24"
                />
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
                  {generatedItems.map((entry) => (
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
                      <td
                        className={`px-4 py-3 text-sm font-semibold ${
                          entry.toBuy > 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {entry.toBuy.toLocaleString("pt-BR")}
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

ProjectsTab.defaultProps = {
  draftProject: null,
  editPanelRef: null,
  generatedQuantity: null,
  canEditProject: false,
};




