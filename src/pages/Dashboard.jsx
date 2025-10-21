import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useInventory } from "../context/InventoryContext";
import { supabase } from "../supabaseClient";
import WltLogoMark from "../components/WltLogoMark";
import {
  dispenserProjectComponents,
  dispenserProjectMetadata,
  delayProjectComponents,
  delayProjectMetadata,
  ntcProjectComponents,
  ntcProjectMetadata,
} from "../data/dispenserComponents";
import {
  PROJECT_STATE_STORAGE_KEY,
  PROJECT_VALUES_STORAGE_KEY,
  clearProjectStateCookies,
  writeProjectStateCookie,
  readProjectStateCookie,
} from "../utils/projectStateStorage";

const cloneComponent = (component) => {
  const cloned = { ...component };
  if (Array.isArray(component.legacyNames)) {
    cloned.legacyNames = [...component.legacyNames];
  }
  if (Array.isArray(component.tags)) {
    cloned.tags = [...component.tags];
  }
  if (Object.prototype.hasOwnProperty.call(component, "inventoryItemId")) {
    cloned.inventoryItemId = component.inventoryItemId;
  }
  return cloned;
};

const buildInitialProjectOption = (id, metadata, components) => ({
  id,
  name: metadata.name,
  metadata: { ...metadata, projectValue: metadata.projectValue ?? 0 },
  components: components.map(cloneComponent),
});

const INITIAL_PROJECT_OPTIONS = [
  buildInitialProjectOption("dispenser", dispenserProjectMetadata, dispenserProjectComponents),
  buildInitialProjectOption("delay", delayProjectMetadata, delayProjectComponents),
  buildInitialProjectOption("ntc", ntcProjectMetadata, ntcProjectComponents),
];

const ALL_TABS = [
  { id: "projects", label: "Projetos" },
  { id: "stock", label: "Estoque" },
  { id: "history", label: "Historico estoque" },
];

const PROJECT_EDIT_PASSWORD = import.meta.env.VITE_PROJECT_EDIT_PASSWORD || "wlt-edit";

const normalize = (value) => (value ? value.toString().trim().toLowerCase() : "");

const buildCatalog = (components) =>
  components.map((component, index) => ({
    ...component,
    itemNumber: component.itemNumber ?? index + 1,
  }));

const sortInventoryItems = (inventoryList) =>
  [...inventoryList].sort((a, b) => {
    const codeA = normalize(a.code);
    const codeB = normalize(b.code);
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, "pt-BR", { numeric: true });
    }
    if (codeA && !codeB) return -1;
    if (!codeA && codeB) return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });

const generateNextStockCode = (items) => {
  const trimmedCodes = items
    .map((item) => (item.code ?? "").trim())
    .filter(Boolean);
  const numericEntries = trimmedCodes
    .map((code) => {
      const match = code.match(/^0*(\d+)$/);
      if (!match) return null;
      return { numeric: Number(match[1]), length: code.length };
    })
    .filter(Boolean);

  const padLength = numericEntries.length
    ? Math.max(
        3,
        numericEntries.reduce((max, entry) => Math.max(max, entry.length), 0),
      )
    : Math.max(
        3,
        trimmedCodes.reduce((max, code) => Math.max(max, code.length), 0) || 3,
      );

  let nextValue =
    numericEntries.length > 0
      ? numericEntries.reduce((max, entry) => Math.max(max, entry.numeric), 0) + 1
      : 1;

  const existingSet = new Set(trimmedCodes.map((code) => code.toLowerCase()));
  let candidate = nextValue.toString().padStart(padLength, "0");

  while (existingSet.has(candidate.toLowerCase())) {
    nextValue += 1;
    candidate = nextValue.toString().padStart(padLength, "0");
  }

  return candidate;
};

export default function Dashboard({
  allowedTabs,
  heroEyebrow = "Central WLT",
  heroTitle = "Hub de Projetos e Estoque",
  heroSubtitle = "Visualize os componentes de cada projeto, acompanhe o estoque e organize o envio para montagem.",
}) {
  const { items, loading, error, updateItem, addItem } = useInventory();

  const allowedTabsKey = Array.isArray(allowedTabs) ? allowedTabs.join("|") : "all";
  const allowedTabIds = useMemo(() => {
    const requested = Array.isArray(allowedTabs) && allowedTabs.length
      ? allowedTabs
      : ALL_TABS.map((tab) => tab.id);
    const normalized = requested.filter((id) => ALL_TABS.some((tab) => tab.id === id));
    return normalized.length ? normalized : [ALL_TABS[0].id];
  }, [allowedTabsKey]);

  const [activeTab, setActiveTab] = useState(() => allowedTabIds[0] ?? ALL_TABS[0].id);
  const allowedTabIdsKey = allowedTabIds.join("|");

  useEffect(() => {
    if (!allowedTabIds.includes(activeTab)) {
      setActiveTab(allowedTabIds[0] ?? ALL_TABS[0].id);
    }
  }, [allowedTabIdsKey, allowedTabIds, activeTab]);

  const [projectOptions, setProjectOptions] = useState(() =>
    INITIAL_PROJECT_OPTIONS.map((project) => ({
      ...project,
      metadata: { ...project.metadata, projectValue: project.metadata.projectValue ?? 0 },
      components: project.components.map(cloneComponent),
    })),
  );

  const availableTabs = useMemo(
    () => ALL_TABS.filter((tab) => allowedTabIds.includes(tab.id)),
    [allowedTabIdsKey],
  );

  const persistProjectState = (projects) => {
    if (typeof window === "undefined") return;
  try {
    const payload = projects.reduce((acc, project) => {
      const metadata = { ...project.metadata };
      if (metadata.projectValue !== undefined) {
        const numericValue = Number(metadata.projectValue);
        metadata.projectValue = Number.isFinite(numericValue) ? numericValue : 0;
      }
      acc[project.id] = {
        metadata,
        components: project.components.map((component) => {
          const cloned = cloneComponent(component);
          if (
            cloned.quantityPerAssembly !== undefined &&
            cloned.quantityPerAssembly !== null
          ) {
            const quantityValue = Number(cloned.quantityPerAssembly);
            cloned.quantityPerAssembly = Number.isFinite(quantityValue) ? quantityValue : 1;
          }
          return cloned;
        }),
      };
      return acc;
    }, {});
    const serialized = JSON.stringify(payload);
    window.localStorage.setItem(PROJECT_STATE_STORAGE_KEY, serialized);
    window.localStorage.removeItem(PROJECT_VALUES_STORAGE_KEY);
    writeProjectStateCookie(serialized);
  } catch (err) {
    console.error("Erro ao salvar configuracao de projetos", err);
    clearProjectStateCookies();
  }
};

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
  const [boardsToProduce, setBoardsToProduce] = useState("");
  const [generatedQuantity, setGeneratedQuantity] = useState(null);
  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustFeedback, setAdjustFeedback] = useState({ type: null, message: "" });
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockHistory, setStockHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [stockSearch, setStockSearch] = useState("");
  const [newItemCode, setNewItemCode] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemLocation, setNewItemLocation] = useState("");
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [newItemFeedback, setNewItemFeedback] = useState({ type: null, message: "" });
  const [hasEditAccess, setHasEditAccess] = useState(false);
  const priceFormatter = useMemo(
    () => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0 }),
    [],
  );

  useEffect(() => {
    setProjectItems([]);
    setIsEditingProject(false);
    setDraftProject(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedState = window.localStorage.getItem(PROJECT_STATE_STORAGE_KEY);
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        if (parsedState && typeof parsedState === "object") {
          setProjectOptions((current) => {
            const next = current.map((project) => {
              const saved = parsedState[project.id];
              if (!saved) return project;

              const savedMetadata = {
                ...project.metadata,
                ...(saved.metadata ?? {}),
              };
              if ("projectValue" in savedMetadata) {
                const numeric = Number(savedMetadata.projectValue);
                savedMetadata.projectValue = Number.isFinite(numeric) ? numeric : 0;
              } else if (savedMetadata.projectValue === undefined) {
                savedMetadata.projectValue = project.metadata.projectValue ?? 0;
              }

              const savedComponents = Array.isArray(saved.components)
                ? saved.components.map((component) => {
                    const cloned = cloneComponent(component);
                    if (
                      cloned.quantityPerAssembly !== undefined &&
                      cloned.quantityPerAssembly !== null
                    ) {
                      const numericQuantity = Number(cloned.quantityPerAssembly);
                      cloned.quantityPerAssembly = Number.isFinite(numericQuantity)
                        ? numericQuantity
                        : 1;
                    }
                    return cloned;
                  })
                : project.components.map(cloneComponent);

              return {
                ...project,
                metadata: savedMetadata,
                components: savedComponents,
              };
            });
            persistProjectState(next);
            return next;
          });
          return;
        }
      }

      const cookieState = readProjectStateCookie();
      if (!storedState && cookieState) {
        const parsedCookie = JSON.parse(cookieState);
        if (parsedCookie && typeof parsedCookie === "object") {
          setProjectOptions((current) => {
            const next = current.map((project) => {
              const saved = parsedCookie[project.id];
              if (!saved) return project;

              const savedMetadata = {
                ...project.metadata,
                ...(saved.metadata ?? {}),
              };
              if ("projectValue" in savedMetadata) {
                const numeric = Number(savedMetadata.projectValue);
                savedMetadata.projectValue = Number.isFinite(numeric) ? numeric : 0;
              } else if (savedMetadata.projectValue === undefined) {
                savedMetadata.projectValue = project.metadata.projectValue ?? 0;
              }

              const savedComponents = Array.isArray(saved.components)
                ? saved.components.map((component) => {
                    const cloned = cloneComponent(component);
                    if (
                      cloned.quantityPerAssembly !== undefined &&
                      cloned.quantityPerAssembly !== null
                    ) {
                      const numericQuantity = Number(cloned.quantityPerAssembly);
                      cloned.quantityPerAssembly = Number.isFinite(numericQuantity)
                        ? numericQuantity
                        : 1;
                    }
                    return cloned;
                  })
                : project.components.map(cloneComponent);

              return {
                ...project,
                metadata: savedMetadata,
                components: savedComponents,
              };
            });
            persistProjectState(next);
            return next;
          });
          return;
        }
      }

      const storedValues = window.localStorage.getItem(PROJECT_VALUES_STORAGE_KEY);
      if (storedValues) {
        const parsedValues = JSON.parse(storedValues);
        if (parsedValues && typeof parsedValues === "object") {
          setProjectOptions((current) => {
            const next = current.map((project) => ({
              ...project,
              metadata: {
                ...project.metadata,
                projectValue:
                  typeof parsedValues[project.id] === "number"
                    ? parsedValues[project.id]
                    : project.metadata.projectValue ?? 0,
              },
            }));
            persistProjectState(next);
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar configuracao de projetos", err);
    }
  }, []);

  useEffect(() => {
    if (isEditingProject && editPanelRef.current) {
      editPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isEditingProject]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setHistoryError(null);
        const { data, error } = await supabase
          .from("historico_estoque")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setStockHistory(data ?? []);
      } catch (err) {
        setHistoryError(err);
      }
    };

    loadHistory();
  }, []);

  const nameIndex = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const nameKey = normalize(item.name);
      if (nameKey) map.set(nameKey, item);
      const codeKey = normalize(item.code);
      if (codeKey) map.set(codeKey, item);
      const descriptionKey = normalize(item.description);
      if (descriptionKey) map.set(descriptionKey, item);
      const nomenclatureKey = normalize(item.nomenclature);
      if (nomenclatureKey) map.set(nomenclatureKey, item);
    });
    return map;
  }, [items]);

  const idIndex = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      map.set(String(item.id), item);
    });
    return map;
  }, [items]);

  const inventorySelectionItems = useMemo(() => sortInventoryItems(items), [items]);

  const findInventoryMatch = (component, preferredTerm) => {
    const directMatch = component.inventoryItemId
      ? idIndex.get(String(component.inventoryItemId)) ?? null
      : null;

    if (directMatch) return directMatch;

    const seen = new Set();
    const candidates = [];
    const pushCandidate = (value) => {
      const normalizedValue = normalize(value);
      if (normalizedValue && !seen.has(normalizedValue)) {
        seen.add(normalizedValue);
        candidates.push(normalizedValue);
      }
    };

    pushCandidate(preferredTerm);
    pushCandidate(component.inventoryName);
    pushCandidate(component.value);
    pushCandidate(component.code);
    pushCandidate(component.legacyCode);
    (component.legacyNames || []).forEach(pushCandidate);
    if (!preferredTerm) {
      pushCandidate(component.description);
      pushCandidate(component.nomenclature);
    }

    for (const candidate of candidates) {
      const exact = nameIndex.get(candidate);
      if (exact) return exact;
    }

  return null;
};

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
          <div className="flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Projeto selecionado
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  {selectedProject.metadata.name}
                </h2>
                <p className="text-sm text-slate-500">
                  Cliente: {selectedProject.metadata.customer}.{" "}
                  {selectedProject.metadata.notes}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Codigo placa pronta:{" "}
                  <span className="font-semibold text-slate-700">
                    {selectedProject.metadata.finishedBoardCode || "-"}
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
                    selectedProject.metadata.projectValue !== undefined &&
                    selectedProject.metadata.projectValue !== null
                      ? selectedProject.metadata.projectValue
                      : 0
                  }
                  onChange={handleProjectValueChange}
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
                onChange={(event) => setBoardsToProduce(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-right text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 lg:w-28"
                placeholder="0"
              />
            </label>
            <button
              type="button"
              onClick={handleGeneratePurchaseReport}
              className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
            >
              Gerar relatorio de compra
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
          Informe a quantidade de placas desejada e utilize o relatorio para calcular o que precisa ser comprado.
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
                    <tr key={index}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          list={`inventory-suggestions-${index}`}
                          value={component.value}
                          onChange={(event) =>
                            handleDraftComponentChange(index, "value", event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                        <datalist id={`inventory-suggestions-${index}`}>
                          {inventorySelectionItems
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
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">
                        {entry.code ? `${entry.code} — ${entry.value}` : entry.value}
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
          Relatorio de compra para montagem
        </h3>
        {projectItems.length === 0 ? (
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
        onClick={handleDownloadReport}
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
                  {projectItems.map((entry) => (
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
          </>
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
          <input
            type="text"
            value={stockSearch}
            onChange={(event) => setStockSearch(event.target.value)}
            placeholder="Buscar por codigo, nome ou descricao..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-80"
          />
        </div>
        <div className="mt-6 grid gap-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Novo componente
            </h4>
            <form
              onSubmit={handleCreateStockItem}
              className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
            >
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Codigo
                <input
                  type="text"
                  value={newItemCode}
                  onChange={(event) => setNewItemCode(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Opcional"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Nome
                <input
                  type="text"
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
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
                  onChange={(event) => setNewItemQuantity(event.target.value)}
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
                Descricao (opcional)
                <input
                  type="text"
                  value={newItemDescription}
                  onChange={(event) => setNewItemDescription(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Detalhes para identificar o componente"
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2">
                Localizacao (opcional)
                <input
                  type="text"
                  value={newItemLocation}
                  onChange={(event) => setNewItemLocation(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Ex: Gaveta A3"
                />
              </label>
            </form>
            {newItemFeedback.type && (
              <p
                className={`mt-3 text-sm ${
                  newItemFeedback.type === "error" ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {newItemFeedback.message}
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
                handleAdjustStock("add");
              }}
              className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] md:items-end"
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
                <td className="px-4 py-3 text-sm text-slate-600">
                  {item.description?.trim() ? item.description : "-"}
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

          {historyError ? (
            <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              Erro ao carregar historico: {historyError.message}
            </p>
          ) : stockHistory.length === 0 ? (
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
                  {stockHistory.map((entry) => (
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
  };
  const catalogWithAvailability = useMemo(() => {
    return projectCatalog.map((component) => {
      const match = findInventoryMatch(component, component.value);

      const availableRaw = Number(match?.quantity ?? component.availableQuantity ?? 0);
      const available = Number.isFinite(availableRaw) ? availableRaw : 0;
      const quantityPerAssemblyRaw = Number(component.quantityPerAssembly ?? 1);
      const quantityPerAssembly =
        Number.isFinite(quantityPerAssemblyRaw) && quantityPerAssemblyRaw > 0
          ? quantityPerAssemblyRaw
          : 1;

      return {
        ...component,
        inventoryItemId:
          component.inventoryItemId !== undefined && component.inventoryItemId !== null
            ? String(component.inventoryItemId)
            : match
              ? String(match.id)
              : "",
        quantityPerAssembly,
        available,
        inventoryName: component.inventoryName?.trim()
          ? component.inventoryName
          : match?.name ?? component.value,
      };
    });
  }, [projectCatalog, nameIndex, idIndex, inventorySelectionItems]);

  useEffect(() => {
    if (!adjustFeedback.type) return undefined;
    const timeout = setTimeout(() => setAdjustFeedback({ type: null, message: "" }), 4000);
    return () => clearTimeout(timeout);
  }, [adjustFeedback]);

  useEffect(() => {
    if (!newItemFeedback.type) return undefined;
    const timeout = setTimeout(() => setNewItemFeedback({ type: null, message: "" }), 4000);
    return () => clearTimeout(timeout);
  }, [newItemFeedback]);

  const handleStartEditing = () => {
    if (!selectedProject) return;
    if (
      PROJECT_EDIT_PASSWORD &&
      PROJECT_EDIT_PASSWORD.trim() &&
      !hasEditAccess
    ) {
      const providedPassword =
        typeof window !== "undefined"
          ? window.prompt("Informe a senha para editar os projetos:")
          : null;
      if (providedPassword !== PROJECT_EDIT_PASSWORD) {
        alert("Senha incorreta. Edicao cancelada.");
        return;
      }
      setHasEditAccess(true);
    }
    const metadata = {
      name: selectedProject.metadata.name ?? "",
      customer: selectedProject.metadata.customer ?? "",
      notes: selectedProject.metadata.notes ?? "",
      observation: selectedProject.metadata.observation ?? "",
      projectValue:
        selectedProject.metadata.projectValue !== undefined &&
        selectedProject.metadata.projectValue !== null
          ? String(selectedProject.metadata.projectValue)
          : "",
    };
    const components = selectedProject.components.map((component) => {
      const cloned = cloneComponent(component);
      const match = findInventoryMatch(cloned, cloned.value);
      const inventoryItemId =
        match?.id !== undefined
          ? String(match.id)
          : cloned.inventoryItemId !== undefined && cloned.inventoryItemId !== null
            ? String(cloned.inventoryItemId)
            : "";
      const descriptionCandidate =
        typeof cloned.description === "string" && cloned.description.trim()
          ? cloned.description.trim()
          : match?.description ?? "";
      const nomenclatureCandidate =
        typeof cloned.nomenclature === "string" && cloned.nomenclature.trim()
          ? cloned.nomenclature
          : match?.nomenclature ?? "";
      const inventoryNameCandidate = cloned.inventoryName?.trim()
        ? cloned.inventoryName
        : match?.name ?? cloned.value ?? "";

      return {
        ...cloned,
        inventoryItemId,
        inventoryName: inventoryNameCandidate,
        description: descriptionCandidate,
        nomenclature: nomenclatureCandidate,
        quantityPerAssembly:
          cloned.quantityPerAssembly !== undefined && cloned.quantityPerAssembly !== null
            ? String(cloned.quantityPerAssembly)
            : "",
      };
    });
    setDraftProject({ metadata, components });
    setIsEditingProject(true);
  };

  const handleProjectValueChange = (event) => {
    const rawValue = event.target.value ?? "";
    const sanitized = rawValue.replace(",", ".");
    let numericValue = Number(sanitized);
    if (rawValue.trim() === "" || !Number.isFinite(numericValue)) {
      numericValue = 0;
    }

  setProjectOptions((current) => {
    const next = current.map((project) =>
      project.id === selectedProjectId
        ? {
            ...project,
            metadata: {
              ...project.metadata,
              projectValue: numericValue,
            },
          }
        : project,
    );
    persistProjectState(next);
    return next;
  });

    if (isEditingProject) {
      setDraftProject((current) =>
        current
          ? {
              ...current,
              metadata: { ...current.metadata, projectValue: rawValue },
            }
          : current,
      );
    }
  };

  const handleCreateStockItem = async (event) => {
    event.preventDefault();

    const trimmedName = newItemName.trim();
    const trimmedCode = newItemCode.trim();
    const trimmedDescription = newItemDescription.trim();
    const trimmedLocation = newItemLocation.trim();

    if (!trimmedName) {
      setNewItemFeedback({ type: "error", message: "Informe o nome do componente." });
      return;
    }

    const quantityNumber =
      newItemQuantity === "" ? 0 : Number(newItemQuantity);
    if (!Number.isFinite(quantityNumber) || quantityNumber < 0) {
      setNewItemFeedback({
        type: "error",
        message: "Informe uma quantidade inicial valida (zero ou positiva).",
      });
      return;
    }

    const existingCodes = items
      .map((item) => (item.code ?? "").trim())
      .filter(Boolean);
    const normalizedExistingCodes = new Set(existingCodes.map((code) => code.toLowerCase()));

    let finalCode = trimmedCode;
    let autoAssignedCode = false;
    if (
      !finalCode ||
      normalizedExistingCodes.has(finalCode.toLowerCase())
    ) {
      finalCode = generateNextStockCode(items);
      autoAssignedCode = true;
    }

    const payload = {
      name: trimmedName,
      quantity: quantityNumber,
    };
    if (finalCode) payload.code = finalCode;
    if (trimmedDescription) payload.description = trimmedDescription;
    if (trimmedLocation) payload.location = trimmedLocation;

    try {
      setIsCreatingItem(true);
      setNewItemFeedback({ type: null, message: "" });

      const createdItem = await addItem(payload);
      setNewItemFeedback({
        type: "success",
        message: `Componente cadastrado no estoque${
          finalCode ? ` com o código ${finalCode}` : ""
        }.`,
      });

      setNewItemCode("");
      setNewItemName("");
      setNewItemDescription("");
      setNewItemQuantity("");
      setNewItemLocation("");
      setAdjustItemId(String(createdItem.id));

      const initialQuantity = Number(createdItem.quantity ?? quantityNumber ?? 0);
      if (initialQuantity > 0) {
        const historyPayload = {
          item_id: createdItem.id,
          action: "add",
          quantity: initialQuantity,
          resulting_quantity: initialQuantity,
          component_name: createdItem.name,
          component_code: createdItem.code ?? null,
        };

        const { data: insertedHistory, error: historyInsertError } = await supabase
          .from("historico_estoque")
          .insert(historyPayload)
          .select("*")
          .single();

        if (historyInsertError) {
          console.error("Falha ao registrar historico inicial:", historyInsertError);
          setHistoryError(historyInsertError);
        } else if (insertedHistory) {
          setStockHistory((current) => [insertedHistory, ...current]);
        }
      }
    } catch (creationError) {
      setNewItemFeedback({
        type: "error",
        message: creationError?.message ?? "Nao foi possivel cadastrar o componente.",
      });
    } finally {
      setIsCreatingItem(false);
    }
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

      const historyPayload = {
        item_id: targetItem.id,
        action,
        quantity: amountNumber,
        resulting_quantity: nextQuantity,
        component_name: targetItem.name,
        component_code: targetItem.code ?? null,
      };

      const { data: insertedHistory, error: historyInsertError } = await supabase
        .from("historico_estoque")
        .insert(historyPayload)
        .select("*")
        .single();

      if (historyInsertError) {
        console.error("Falha ao registrar historico de estoque:", historyInsertError);
        setHistoryError(historyInsertError);
      } else if (insertedHistory) {
        setStockHistory((current) => [insertedHistory, ...current]);
      }

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
      const nextComponents = current.components.map((component, componentIndex) => {
        if (componentIndex !== index) return component;
        const nextComponent = { ...component, [field]: value };
        if (field === "value") {
          const trimmed = value.trim();
          nextComponent.value = trimmed;
          if (!trimmed) {
            nextComponent.inventoryItemId = "";
            nextComponent.inventoryName = "";
            nextComponent.description = "";
            nextComponent.nomenclature = "";
        } else {
          const lookupComponent = {
            ...component,
            value: trimmed,
            inventoryName: trimmed,
          };
          const match = findInventoryMatch(lookupComponent, trimmed);
            if (match) {
              const matchId = String(match.id);
              const previousId = component.inventoryItemId
                ? String(component.inventoryItemId)
                : "";
              const isNewMatch = matchId !== previousId;
              nextComponent.inventoryItemId = matchId;
              nextComponent.inventoryName = match.name;
              nextComponent.value = trimmed;
              nextComponent.description = match.description ?? "";
              nextComponent.nomenclature = match.nomenclature?.trim() ?? "";
            } else {
              nextComponent.inventoryItemId = "";
              nextComponent.inventoryName = trimmed;
              nextComponent.description = "";
              nextComponent.nomenclature = "";
            }
          }
        }
        return nextComponent;
      });
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
            inventoryItemId: null,
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
        cloned.inventoryItemId =
          component.inventoryItemId && String(component.inventoryItemId).trim()
            ? String(component.inventoryItemId)
            : null;
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

    setProjectOptions((current) => {
      const next = current.map((project) => {
        if (project.id !== selectedProjectId) return project;
    return {
      ...project,
      name: metadata.name,
      metadata,
      components: sanitizedComponents,
    };
  });
  persistProjectState(next);
  return next;
});
    setIsEditingProject(false);
    setDraftProject(null);
  };

  const handleGeneratePurchaseReport = () => {
    const requestedQuantity = Number(boardsToProduce);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      alert("Informe uma quantidade valida de placas.");
      return;
    }

    const nextItems = catalogWithAvailability.map((entry) => {
      const perBoardRaw = Number(entry.quantityPerAssembly ?? 1);
      const perBoard =
        Number.isFinite(perBoardRaw) && perBoardRaw > 0 ? perBoardRaw : 1;
      const availableRaw = Number(entry.available ?? 0);
      const available = Number.isFinite(availableRaw) ? availableRaw : 0;
      const required = perBoard * requestedQuantity;
      const toBuy = Math.max(0, required - available);

      return {
        id: entry.catalogCode || entry.code || entry.value,
        code: entry.code || entry.catalogCode || null,
        name: entry.inventoryName || entry.value,
        available,
        perBoard,
        required,
        toBuy,
        nomenclature: entry.nomenclature ?? "",
      };
    });

    setProjectItems(nextItems);
    setGeneratedQuantity(requestedQuantity);
  };

  const handleDownloadReport = () => {
    if (!projectItems.length) {
      alert("Gere o relatorio antes de exportar.");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    const projectName = selectedProject?.metadata?.name ?? "Projeto";
    const quantityText = generatedQuantity
      ? `${priceFormatter.format(generatedQuantity)} placas`
      : "Quantidade não informada";

    doc.setFontSize(16);
    doc.text(`Relatorio de compra - ${projectName}`, 40, 50);
    doc.setFontSize(11);
    doc.text(`Quantidade considerada: ${quantityText}`, 40, 70);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}`,
      40,
      90,
    );

    const body = projectItems.map((entry) => [
      entry.name,
      priceFormatter.format(entry.available),
      priceFormatter.format(entry.perBoard),
      priceFormatter.format(entry.required),
      priceFormatter.format(entry.toBuy),
      entry.nomenclature?.trim() ? entry.nomenclature : "-",
    ]);

    autoTable(doc, {
      startY: 110,
      head: [["Componente", "Qtd necessaria"]],
      body: projectItems.map((entry) => [
        entry.code ? `${entry.code} - ${entry.name}` : entry.name,
        priceFormatter.format(entry.required),
      ]),
      styles: { fontSize: 10 },
      headStyles: {
        fillColor: [15, 76, 129],
      },
      columnStyles: {
        1: { halign: "right" },
      },
    });

    const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `relatorio-compra-${safeProjectName.toLowerCase()}-${Date.now()}.pdf`;
    doc.save(fileName);
  };

  const handleRemoveProjectItem = (id) => {
    if (!confirm("Remover este componente da lista de montagem?")) return;
    setProjectItems((current) => current.filter((item) => item.id !== id));
  };

  const filteredStockItems = useMemo(() => {
    const sorted = sortInventoryItems(items);

    const search = normalize(stockSearch);
    if (!search) return sorted;

    return sorted.filter((item) => {
      const code = normalize(item.code);
      const name = normalize(item.name);
      const description = normalize(item.description);
      const nomenclature = normalize(item.nomenclature);
      const location = normalize(item.location);

      return (
        code.includes(search) ||
        name.includes(search) ||
        description.includes(search) ||
        nomenclature.includes(search) ||
        location.includes(search)
      );
    });
  }, [items, stockSearch]);

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
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <WltLogoMark className="h-12 w-auto" title="Logo WLT" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">
                {heroEyebrow}
              </p>
              <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{heroTitle}</h1>
            </div>
          </div>
          <p className="max-w-xl text-sm text-slate-600 md:text-base">{heroSubtitle}</p>
        </div>
      </div>

      {availableTabs.length > 1 && (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 p-2 shadow-inner">
          <nav className="flex gap-2">
            {availableTabs.map((tab) => {
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
      )}

      {activeTab === "projects"
        ? renderProjectsTab()
        : activeTab === "stock"
        ? renderStockTab()
        : renderHistoryTab()}
    </div>
  );
}






