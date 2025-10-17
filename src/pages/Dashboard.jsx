import { useEffect, useMemo, useRef, useState } from "react";
import { useInventory } from "../context/InventoryContext";
import heroBackground from "../assets/wlt-logo.svg";
import {
  dispenserProjectComponents,
  dispenserProjectMetadata,
  delayProjectComponents,
  delayProjectMetadata,
  ntcProjectComponents,
  ntcProjectMetadata,
} from "../data/dispenserComponents";

const cloneComponent = (component) => {
  const cloned = { ...component };
  if (Array.isArray(component.legacyNames)) {
    cloned.legacyNames = [...component.legacyNames];
  }
  if (Array.isArray(component.tags)) {
    cloned.tags = [...component.tags];
  }
  return cloned;
};

const buildInitialProjectOption = (id, metadata, components) => ({
  id,
  name: metadata.name,
  metadata: { ...metadata },
  components: components.map(cloneComponent),
});

const INITIAL_PROJECT_OPTIONS = [
  buildInitialProjectOption("dispenser", dispenserProjectMetadata, dispenserProjectComponents),
  buildInitialProjectOption("delay", delayProjectMetadata, delayProjectComponents),
  buildInitialProjectOption("ntc", ntcProjectMetadata, ntcProjectComponents),
];

const tabs = [
  { id: "projects", label: "Projetos" },
  { id: "stock", label: "Estoque" },
  { id: "history", label: "Historico estoque" },
];

const normalize = (value) => (value ? value.toString().trim().toLowerCase() : "");

const buildCatalog = (components) =>
  components.map((component, index) => ({
    ...component,
    itemNumber: component.itemNumber ?? index + 1,
  }));

export default function Dashboard() {
  const { items, loading, error, updateItem } = useInventory();

  const [activeTab, setActiveTab] = useState("projects");

  const [projectOptions, setProjectOptions] = useState(() =>
    INITIAL_PROJECT_OPTIONS.map((project) => ({
      ...project,
      metadata: { ...project.metadata },
      components: project.components.map(cloneComponent),
    })),
  );

  const [selectedProjectId, setSelectedProjectId] = useState(
    INITIAL_PROJECT_OPTIONS[0]?.id ?? "dispenser",
  );
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [draftProject, setDraftProject] = useState(null);
  const editPanelRef = useRef(null);

  const selectedProject =
    projectOptions.find((option) => option.id === selectedProjectId) ??
    projectOptions[0];

  const projectCatalog = useMemo(
    () => buildCatalog(selectedProject.components),
    [selectedProject],
  );

  const [projectItems, setProjectItems] = useState([]);
  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustFeedback, setAdjustFeedback] = useState({ type: null, message: "" });
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockHistory, setStockHistory] = useState([]);

  useEffect(() => {
    setProjectItems([]);
    setIsEditingProject(false);
    setDraftProject(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (isEditingProject && editPanelRef.current) {
      editPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isEditingProject]);

  const nameIndex = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      map.set(normalize(item.name), item);
      if (item.code) map.set(normalize(item.code), item);
    });
    return map;
  }, [items]);

  const renderProjectsTab = () => (
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
          onChange={(event) => setSelectedProjectId(event.target.value)}
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
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Projeto selecionado
            </p>
            <h2 className="text-xl font-semibold text-slate-800">
              {selectedProject.metadata.name}
            </h2>
            <p className="text-sm text-slate-500">
              Cliente: {selectedProject.metadata.customer}.{" "}
              {selectedProject.metadata.notes}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleLoadProject}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
            >
              Gerar lista de montagem
            </button>
            {!isEditingProject && (
              <button
                type="button"
                onClick={handleStartEditing}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Editar projeto
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Clique em "Gerar lista de montagem" para criar uma lista temporaria com as quantidades disponiveis.
        </p>
  
        {isEditingProject && draftProject ? (
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
                  value={draftProject.metadata.name}
                  onChange={(event) => handleDraftMetadataChange("name", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Cliente
                <input
                  type="text"
                  value={draftProject.metadata.customer}
                  onChange={(event) => handleDraftMetadataChange("customer", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 sm:col-span-2">
                Notas
                <textarea
                  rows={3}
                  value={draftProject.metadata.notes}
                  onChange={(event) => handleDraftMetadataChange("notes", event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 sm:col-span-2">
                Observacao
                <textarea
                  rows={2}
                  value={draftProject.metadata.observation}
                  onChange={(event) => handleDraftMetadataChange("observation", event.target.value)}
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
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">
                  Descricao
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
                  {draftProject.components.map((component, index) => (
                    <tr key={`${component.value || "component"}-${index}`}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={component.value}
                          onChange={(event) =>
                            handleDraftComponentChange(index, "value", event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={component.description ?? ""}
                          onChange={(event) =>
                            handleDraftComponentChange(index, "description", event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </td>
                    <td className="px-3 py-2 align-top text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={component.quantityPerAssembly}
                        onChange={(event) =>
                          handleDraftComponentChange(
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
                          handleDraftComponentChange(index, "nomenclature", event.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftComponent(index)}
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
                onClick={handleAddDraftComponent}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Adicionar componente
              </button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleSaveProject}
                  className="inline-flex min-w-[160px] items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  Salvar alteracoes
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditing}
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
                      Codigo
                    </th>
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
                  {catalogWithAvailability.map((entry) => (
                    <tr key={entry.catalogCode || entry.code || entry.value}>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-600">
                        {entry.code}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800">
                          {entry.value}
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
  
            {selectedProject.metadata.observation && (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                {selectedProject.metadata.observation}
              </p>
            )}
          </>
        )}
      </section>
  
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">
          Componentes selecionados para montagem
        </h3>
        {projectItems.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Clique em "Gerar lista de montagem" para preencher esta tabela.
          </p>
        ) : (
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
                    Nomenclatura
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectItems.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">
                      {entry.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.available.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.perBoard.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.nomenclature?.trim() ? entry.nomenclature : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveProjectItem(entry.id)}
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
        )}
      </section>
    </div>
  );
  
  const renderStockTab = () => (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
          <h2 className="text-xl font-semibold text-slate-800">
            Estoque cadastrado
          </h2>
          <p className="text-sm text-slate-500">
            Lista completa dos componentes.
          </p>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleAdjustStock("add");
          }}
          className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] md:items-end"
        >
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Componente
            <select
              value={adjustItemId}
              onChange={(event) => setAdjustItemId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">Selecione um componente</option>
              {filteredStockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code ? `${item.code} - ` : ""}{item.name} (Atual: {item.quantity ?? 0})
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
              onChange={(event) => setAdjustAmount(event.target.value)}
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
            onClick={() => handleAdjustStock("remove")}
            disabled={isUpdatingStock}
            className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remover
          </button>
        </form>
        {adjustFeedback.type && (
          <p
            className={`mt-3 text-sm ${
              adjustFeedback.type === "error" ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {adjustFeedback.message}
          </p>
        )}
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
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quantidade
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStockItems.map((item, index) => (
              <tr
                key={item.id}
                className={index % 2 === 0 ? "bg-white" : "bg-sky-50/40"}
              >
                  <td className="px-4 py-3 text-sm font-mono text-slate-700">
                    {item.code || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {item.quantity?.toLocaleString("pt-BR") ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderHistoryTab = () => {
    const orderedHistory = [...stockHistory].reverse();

    return (
      <div className="space-y-6">
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                Historico de movimentacao
              </h2>
              <p className="text-sm text-slate-500">
                Registros de entradas e saidas realizadas manualmente neste painel.
              </p>
            </div>
          </div>

          {orderedHistory.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Ainda n\u00e3o h\u00e1 movimentacoes registradas. Utilize os botoes de adicionar ou
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
                  {orderedHistory.map((entry) => (
                    <tr key={entry.id} className="bg-white">
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {new Date(entry.timestamp).toLocaleString("pt-BR")}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm font-medium ${
                          entry.action === "add" ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {entry.action === "add" ? "Entrada" : "Saida"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {entry.code ? `${entry.code} - ` : ""}
                        {entry.name}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">
                        {entry.quantity.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">
                        {entry.resultingQuantity.toLocaleString("pt-BR")}
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
  };
  const catalogWithAvailability = useMemo(() => {
    return projectCatalog.map((component) => {
      const possibleNames = [
        component.inventoryName,
        component.value,
        component.code,
        component.legacyCode,
        ...(component.legacyNames || []),
      ]
        .filter(Boolean)
        .map((value) => normalize(value));

      const match =
        possibleNames
          .map((candidate) => nameIndex.get(candidate))
          .find(Boolean) ?? null;

      return {
        ...component,
        available: match?.quantity ?? component.availableQuantity ?? 0,
        inventoryName: match?.name ?? component.value,
      };
    });
  }, [projectCatalog, nameIndex]);

  useEffect(() => {
    if (!adjustFeedback.type) return undefined;
    const timeout = setTimeout(() => setAdjustFeedback({ type: null, message: "" }), 4000);
    return () => clearTimeout(timeout);
  }, [adjustFeedback]);

  const handleStartEditing = () => {
    if (!selectedProject) return;
    const metadata = {
      name: selectedProject.metadata.name ?? "",
      customer: selectedProject.metadata.customer ?? "",
      notes: selectedProject.metadata.notes ?? "",
      observation: selectedProject.metadata.observation ?? "",
    };
  const components = selectedProject.components.map((component) => ({
    ...cloneComponent(component),
    quantityPerAssembly:
      component.quantityPerAssembly !== undefined
        ? String(component.quantityPerAssembly)
        : "",
    description: component.description ?? "",
    nomenclature: component.nomenclature ?? "",
  }));
    setDraftProject({ metadata, components });
    setIsEditingProject(true);
  };

  const handleAdjustStock = async (action) => {
    if (!adjustItemId) {
      setAdjustFeedback({ type: "error", message: "Selecione um componente." });
      return;
    }

    const amountNumber = Number(adjustAmount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setAdjustFeedback({ type: "error", message: "Informe uma quantidade positiva." });
      return;
    }

    const targetItem = items.find((item) => String(item.id) === adjustItemId);
    if (!targetItem) {
      setAdjustFeedback({ type: "error", message: "Componente nao encontrado." });
      return;
    }

    const currentQuantity = Number(targetItem.quantity) || 0;
    const nextQuantity =
      action === "add" ? currentQuantity + amountNumber : currentQuantity - amountNumber;

    if (nextQuantity < 0) {
      setAdjustFeedback({
        type: "error",
        message: "Nao e possivel remover mais itens do que o estoque atual.",
      });
      return;
    }

    try {
      setIsUpdatingStock(true);
      await updateItem(targetItem.id, { quantity: nextQuantity });
      setStockHistory((current) => [
        ...current,
        {
          id: `${targetItem.id}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          action,
          quantity: amountNumber,
          resultingQuantity: nextQuantity,
          name: targetItem.name,
          code: targetItem.code ?? "",
        },
      ]);
      setAdjustFeedback({
        type: "success",
        message:
          action === "add"
            ? "Estoque atualizado com adicao do componente."
            : "Estoque atualizado com retirada do componente.",
      });
      setAdjustAmount("");
    } catch (updateError) {
      setAdjustFeedback({
        type: "error",
        message: updateError?.message ?? "Nao foi possivel atualizar o estoque.",
      });
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const handleCancelEditing = () => {
    setIsEditingProject(false);
    setDraftProject(null);
  };

  const handleDraftMetadataChange = (field, value) => {
    setDraftProject((current) => {
      if (!current) return current;
      return {
        ...current,
        metadata: { ...current.metadata, [field]: value },
      };
    });
  };

  const handleDraftComponentChange = (index, field, value) => {
    setDraftProject((current) => {
      if (!current) return current;
      const nextComponents = current.components.map((component, componentIndex) =>
        componentIndex === index ? { ...component, [field]: value } : component,
      );
      return { ...current, components: nextComponents };
    });
  };

  const handleRemoveDraftComponent = (index) => {
    setDraftProject((current) => {
      if (!current) return current;
      const nextComponents = current.components.filter(
        (_component, componentIndex) => componentIndex !== index,
      );
      return { ...current, components: nextComponents };
    });
  };

  const handleAddDraftComponent = () => {
    setDraftProject((current) => {
      if (!current) return current;
      return {
        ...current,
        components: [
          ...current.components,
          {
            value: "",
            description: "",
            inventoryName: "",
            quantityPerAssembly: "1",
            includeInProject: true,
          },
        ],
      };
    });
  };

  const handleSaveProject = () => {
    if (!draftProject) return;

    const metadata = {
      ...draftProject.metadata,
      name: draftProject.metadata.name?.trim() ?? "",
      customer: draftProject.metadata.customer?.trim() ?? "",
      notes: draftProject.metadata.notes?.trim() ?? "",
      observation: draftProject.metadata.observation?.trim() ?? "",
    };

    if (!metadata.name) {
      alert("Informe um nome para o projeto.");
      return;
    }

    const sanitizedComponents = draftProject.components
      .map((component) => {
        const trimmedValue = component.value?.trim() ?? "";
        if (!trimmedValue) return null;

        const quantityNumber = Number(component.quantityPerAssembly);
        const quantityPerAssembly =
          Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : 1;

        const cloned = cloneComponent(component);
        cloned.value = trimmedValue;
        cloned.quantityPerAssembly = quantityPerAssembly;
        cloned.inventoryName = component.inventoryName?.trim()
          ? component.inventoryName.trim()
          : trimmedValue;
        if (typeof component.description === "string") {
          cloned.description = component.description.trim();
        }
        cloned.nomenclature = component.nomenclature?.trim() ?? "";
        if (typeof component.package === "string") {
          cloned.package = component.package.trim() || component.package;
        }

        return cloned;
      })
      .filter(Boolean);

    if (sanitizedComponents.length === 0) {
      alert("Adicione pelo menos um componente ao projeto.");
      return;
    }

    setProjectOptions((current) =>
      current.map((project) => {
        if (project.id !== selectedProjectId) return project;
        return {
          ...project,
          name: metadata.name,
          metadata,
          components: sanitizedComponents,
        };
      }),
    );
    setIsEditingProject(false);
    setDraftProject(null);
  };

  const handleLoadProject = () => {
    const nextItems = catalogWithAvailability.map((entry) => ({
      id: entry.catalogCode || entry.code || entry.value,
      name: entry.inventoryName,
      available: entry.available,
      perBoard: entry.quantityPerAssembly ?? 1,
      nomenclature: entry.nomenclature ?? "",
    }));
    setProjectItems(nextItems);
  };

  const handleRemoveProjectItem = (id) => {
    if (!confirm("Remover este componente da lista de montagem?")) return;
    setProjectItems((current) => current.filter((item) => item.id !== id));
  };

  const filteredStockItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const codeA = normalize(a.code);
      const codeB = normalize(b.code);
      if (codeA && codeB && codeA !== codeB) {
        return codeA.localeCompare(codeB, "pt-BR", { numeric: true });
      }
      if (codeA && !codeB) return -1;
      if (!codeA && codeB) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    return sorted;
  }, [items]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm font-medium text-slate-500">
          Carregando dados do estoque...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-700">
          Erro ao carregar o dashboard
        </h2>
        <p className="mt-2 text-sm text-red-600">{error.message}</p>
      </div>
    );
  }







  return (
    <div className="space-y-8">
      <div
        className="relative overflow-hidden rounded-3xl text-white shadow-xl"
        style={{
          backgroundImage: `url(${heroBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-slate-900/70" aria-hidden />
        <div className="relative z-10 space-y-4 p-8 sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">
            Central WLT
          </p>
          <h1 className="text-3xl font-bold md:text-4xl">Hub de Projetos e Estoque</h1>
          <p className="max-w-2xl text-sm text-slate-100 md:text-base">
            Visualize os componentes de cada projeto, acompanhe o estoque e organize o envio para montagem.
          </p>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 p-2 shadow-inner">
        <nav className="flex gap-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-sky-600 text-white shadow"
                    : "bg-transparent text-slate-500 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "projects"
        ? renderProjectsTab()
        : activeTab === "stock"
        ? renderStockTab()
        : renderHistoryTab()}
    </div>
  );
}
