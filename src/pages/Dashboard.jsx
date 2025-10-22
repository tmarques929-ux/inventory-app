import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useInventory } from "../context/InventoryContext";
import { supabase } from "../supabaseClient";
import WltLogoMark from "../components/WltLogoMark";
import { useNotifications } from "../context/NotificationContext";
import { usePermissions } from "../context/PermissionsContext";
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
import ProjectsTab from "./dashboard/ProjectsTab";
import StockTab from "./dashboard/StockTab";
import HistoryTab from "./dashboard/HistoryTab";
import ReportsTab from "./dashboard/ReportsTab";

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
  { id: "reports", label: "Relatorios" },
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
  const { hasPermission } = usePermissions();
  const canManageProjects = hasPermission("manageProjects");
  const canManageStock = hasPermission("manageStock");
  const { notifyWarning, notifyError } = useNotifications();

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
            if (cloned.quantityPerAssembly !== undefined && cloned.quantityPerAssembly !== null) {
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
      const valueMap = projects.reduce((acc, project) => {
        const rawValue = project?.metadata?.projectValue;
        const numeric = Number(rawValue);
        acc[project.id] = Number.isFinite(numeric) ? numeric : 0;
        return acc;
      }, {});
      window.localStorage.setItem(PROJECT_VALUES_STORAGE_KEY, JSON.stringify(valueMap));
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
    if (!canManageProjects) {
      notifyError("Voce nao tem permissao para editar projetos.");
      return;
    }
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
        notifyError("Senha incorreta. Edicao cancelada.");
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
    if (!canManageStock) {
      notifyError("Voce nao tem permissao para alterar o estoque.");
      return;
    }

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
    if (!canManageStock) {
      notifyError("Voce nao tem permissao para alterar o estoque.");
      return;
    }
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
    if (!canManageProjects) return;
    setDraftProject((current) => {
      if (!current) return current;
      return {
        ...current,
        metadata: { ...current.metadata, [field]: value },
      };
    });
  };

  const handleDraftComponentChange = (index, field, value) => {
    if (!canManageProjects) return;
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
    if (!canManageProjects) return;
    setDraftProject((current) => {
      if (!current) return current;
      const nextComponents = current.components.filter(
        (_component, componentIndex) => componentIndex !== index,
      );
      return { ...current, components: nextComponents };
    });
  };

  const handleAddDraftComponent = () => {
    if (!canManageProjects) return;
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
    if (!canManageProjects) {
      notifyError("Voce nao tem permissao para salvar alteracoes de projetos.");
      return;
    }
    if (!draftProject) return;

    const metadata = {
      ...draftProject.metadata,
      name: draftProject.metadata.name?.trim() ?? "",
      customer: draftProject.metadata.customer?.trim() ?? "",
      notes: draftProject.metadata.notes?.trim() ?? "",
      observation: draftProject.metadata.observation?.trim() ?? "",
    };

    if (!metadata.name) {
      notifyWarning("Informe um nome para o projeto.");
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
      notifyWarning("Adicione pelo menos um componente ao projeto.");
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
      notifyWarning("Informe uma quantidade valida de placas.");
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
      notifyWarning("Gere o relatorio antes de exportar.");
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

  const projectsTabProps = {
    projectOptions,
    canEditProject: canManageProjects,
    selectedProjectId,
    onSelectProject: setSelectedProjectId,
    selectedProject,
    onProjectValueChange: handleProjectValueChange,
    boardsToProduce,
    onBoardsToProduceChange: setBoardsToProduce,
    onGenerateReport: handleGeneratePurchaseReport,
    isEditingProject,
    onStartEditing: handleStartEditing,
    draftProject,
    editPanelRef,
    onDraftMetadataChange: handleDraftMetadataChange,
    onDraftComponentChange: handleDraftComponentChange,
    onRemoveDraftComponent: handleRemoveDraftComponent,
    onAddDraftComponent: handleAddDraftComponent,
    onSaveProject: handleSaveProject,
    onCancelEditing: handleCancelEditing,
    inventorySelectionItems,
    normalize,
    catalogWithAvailability,
    projectItems,
    generatedQuantity,
    onDownloadReport: handleDownloadReport,
    onRemoveProjectItem: handleRemoveProjectItem,
  };

  const stockTabProps = {
    stockSearch,
    canManageStock,
    onStockSearchChange: setStockSearch,
    onCreateStockItem: handleCreateStockItem,
    newItemCode,
    onNewItemCodeChange: setNewItemCode,
    newItemName,
    onNewItemNameChange: setNewItemName,
    newItemQuantity,
    onNewItemQuantityChange: setNewItemQuantity,
    isCreatingItem,
    newItemDescription,
    onNewItemDescriptionChange: setNewItemDescription,
    newItemLocation,
    onNewItemLocationChange: setNewItemLocation,
    newItemFeedback,
    filteredStockItems,
    adjustItemId,
    onAdjustItemIdChange: setAdjustItemId,
    adjustAmount,
    onAdjustAmountChange: setAdjustAmount,
    onAdjustStock: handleAdjustStock,
    isUpdatingStock,
    adjustFeedback,
  };





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

      {(() => {
        switch (activeTab) {
          case "projects":
            return <ProjectsTab {...projectsTabProps} />;
          case "stock":
            return <StockTab {...stockTabProps} />;
          case "history":
            return <HistoryTab historyError={historyError} stockHistory={stockHistory} />;
          case "reports":
            return <ReportsTab />;
          default:
            return <ProjectsTab {...projectsTabProps} />;
        }
      })()}
    </div>
  );
}





















