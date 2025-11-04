import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useInventory } from "../context/InventoryContext";
import { supabase } from "../supabaseClient";
import WltLogoMark from "../components/WltLogoMark";
import { useNotifications } from "../context/NotificationContext";
import { usePermissions } from "../context/PermissionsContext";
import { useAuth } from "../context/AuthContext";
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
  metadata: {
    ...metadata,
    projectValue: metadata.projectValue ?? { amount: 0, currency: "BRL" },
    pcbVersion: metadata.pcbVersion ?? "",
    softwareName: metadata.softwareName ?? "",
    softwareFilePath: metadata.softwareFilePath ?? null,
    gerberName: metadata.gerberName ?? "",
    gerberFilePath: metadata.gerberFilePath ?? null,
  },
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
const PROJECT_SOFTWARE_BUCKET =
  import.meta.env.VITE_PROJECT_SOFTWARE_BUCKET || "project_software";
const PROJECT_GERBER_BUCKET =
  import.meta.env.VITE_PROJECT_GERBER_BUCKET || "project_gerbers";
const COMPANY_DOCUMENTS_BUCKET =
  import.meta.env.VITE_COMPANY_DOCUMENTS_BUCKET || "company_documents";
const FILE_SIGNED_URL_TTL = 60 * 10;
const PROJECT_SYNC_DEBOUNCE_MS = 800;
const SUPPORTED_CURRENCIES = ["BRL", "USD"];
const DEFAULT_USD_RATE_SEED = Number(import.meta.env.VITE_USD_EXCHANGE_RATE ?? "5");
const DEFAULT_USD_RATE =
  Number.isFinite(DEFAULT_USD_RATE_SEED) && DEFAULT_USD_RATE_SEED > 0
    ? DEFAULT_USD_RATE_SEED
    : 5;

const mapRevisionRow = (row) => {
  const metadata = row?.metadata ?? {};
  return {
    id: row.id,
    revision: row.revision,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    createdByEmail: row.created_by_email,
    softwarePath: row.software_path ?? metadata.softwareFilePath ?? null,
    hardwarePath: metadata.hardwareFilePath ?? metadata.gerberFilePath ?? null,
    softwareVersion:
      metadata.softwareVersion ??
      metadata.softwareName ??
      metadata.softwareLabel ??
      null,
    hardwareVersion:
      metadata.hardwareVersion ??
      metadata.pcbVersion ??
      metadata.hardwareLabel ??
      null,
  };
};

const mapReservationRow = (row) => ({
  id: row.id,
  itemId: row.item_id ? String(row.item_id) : null,
  projetoId: row.projeto_id,
  quantidade: Number(row.quantidade ?? 0),
  status: row.status ?? "pendente",
  createdAt: row.created_at,
  createdBy: row.created_by,
  consumidoEm: row.consumido_em,
  observacoes: row.observacoes ?? null,
});

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

const pickPositiveNumber = (...candidates) => {
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.round(numeric);
    }
  }
  return null;
};

const resolvePurchaseConstraints = (component = {}, inventoryItem = {}) => {
  let purchaseLot = pickPositiveNumber(
    component.purchaseLot,
    component.purchase_lot,
    component.loteCompra,
    component.lote_compra,
    component.multiploCompra,
    component.multiplo_compra,
    inventoryItem.purchaseLot,
    inventoryItem.purchase_lot,
    inventoryItem.lote_compra,
    inventoryItem.multiplo_compra,
  );

  const descriptor = [
    component.name,
    component.value,
    component.description,
    inventoryItem.name,
    inventoryItem.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!purchaseLot && descriptor.includes("resistor")) {
    purchaseLot = 5000;
  }

  let minimumOrderQuantity = pickPositiveNumber(
    component.minimumOrderQuantity,
    component.minimum_order_quantity,
    component.moq,
    component.quantidadeMinima,
    component.quantidade_minima,
    component.minOrderQty,
    component.min_order_qty,
    inventoryItem.minimumOrderQuantity,
    inventoryItem.minimum_order_quantity,
    inventoryItem.moq,
    inventoryItem.quantidade_minima,
    inventoryItem.min_order_qty,
  );

  if (!minimumOrderQuantity && purchaseLot) {
    minimumOrderQuantity = purchaseLot;
  }

  return { purchaseLot, minimumOrderQuantity };
};

const mergePositiveConstraint = (current, incoming) => {
  const currentNumeric = Number(current);
  const incomingNumeric = Number(incoming);
  const currentValid = Number.isFinite(currentNumeric) && currentNumeric > 0;
  const incomingValid = Number.isFinite(incomingNumeric) && incomingNumeric > 0;
  if (currentValid && incomingValid) {
    return Math.max(Math.round(currentNumeric), Math.round(incomingNumeric));
  }
  if (incomingValid) return Math.round(incomingNumeric);
  if (currentValid) return Math.round(currentNumeric);
  return null;
};

const computePurchaseQuantity = (
  required,
  available,
  purchaseLot = 1,
  minimumOrderQuantity = 0,
) => {
  const shortage = Math.max(0, Number(required) - Number(available));
  if (shortage <= 0) return 0;
  const lotNumeric = Number(purchaseLot);
  const effectiveLot =
    Number.isFinite(lotNumeric) && lotNumeric > 0 ? Math.round(lotNumeric) : 1;
  const rounded = Math.ceil(shortage / effectiveLot) * effectiveLot;
  const moqNumeric = Number(minimumOrderQuantity);
  const effectiveMoq =
    Number.isFinite(moqNumeric) && moqNumeric > 0 ? Math.round(moqNumeric) : 0;
  return Math.max(rounded, effectiveMoq);
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
  const { user: authUser } = useAuth() ?? {};

  const allowedTabsKey = Array.isArray(allowedTabs) ? allowedTabs.join("|") : "all";
  const allowedTabIds = useMemo(() => {
    const requested = Array.isArray(allowedTabs) && allowedTabs.length
      ? allowedTabs
      : ALL_TABS.map((tab) => tab.id);
    const normalized = requested.filter((id) => ALL_TABS.some((tab) => tab.id === id));
    return normalized.length ? normalized : [ALL_TABS[0].id];
  }, [allowedTabsKey]);

  const formatProjectMetadata = (input = {}) => {
    const metadata = { ...input };
    const clean = (value) => (typeof value === "string" ? value.trim() : "");
    const cleanOrNull = (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };
    const normalizeCurrency = (currency) => {
      if (typeof currency !== "string") return "BRL";
      const normalized = currency.trim().toUpperCase();
      return normalized || "BRL";
    };
    const normalizeProjectValue = (value, fallbackCurrency = "BRL") => {
      if (value && typeof value === "object") {
        const amount = Number(value.amount ?? value.value ?? 0);
        const currency = normalizeCurrency(value.currency ?? value.moeda ?? fallbackCurrency);
        return {
          amount: Number.isFinite(amount) ? amount : 0,
          currency,
        };
      }
      const numericValue = Number(value);
      return {
        amount: Number.isFinite(numericValue) ? numericValue : 0,
        currency: normalizeCurrency(fallbackCurrency),
      };
    };

    metadata.name = clean(metadata.name);
    metadata.customer = clean(metadata.customer);
    metadata.finishedBoardCode = clean(metadata.finishedBoardCode);
    metadata.notes = typeof metadata.notes === "string" ? metadata.notes.trim() : "";
    metadata.observation =
      typeof metadata.observation === "string" ? metadata.observation.trim() : "";
    metadata.pcbVersion = clean(metadata.pcbVersion);
    metadata.softwareName = clean(metadata.softwareName);
    metadata.softwareFilePath = cleanOrNull(metadata.softwareFilePath);
    metadata.gerberName = clean(metadata.gerberName);
    metadata.gerberFilePath = cleanOrNull(metadata.gerberFilePath);

    const fallbackCurrency =
      typeof metadata.projectCurrency === "string" ? metadata.projectCurrency : "BRL";
    metadata.projectValue = normalizeProjectValue(metadata.projectValue, fallbackCurrency);
    delete metadata.projectCurrency;

    return metadata;
  };

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
      metadata: formatProjectMetadata(project.metadata),
      components: project.components.map(cloneComponent),
    })),
  );

  const availableTabs = useMemo(
    () => ALL_TABS.filter((tab) => allowedTabIds.includes(tab.id)),
    [allowedTabIdsKey],
  );

  const projectSyncTimeoutRef = useRef(null);
  const pendingProjectSyncRef = useRef(null);

  const sanitizeStorageFileName = (rawName, fallbackPrefix = "software") => {
    if (!rawName) return fallbackPrefix;
    return rawName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9.\-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || fallbackPrefix;
  };

  const sanitizeProjectForPersistence = (project) => {
    const metadata = formatProjectMetadata(project?.metadata ?? {});

    const components = Array.isArray(project?.components)
      ? project.components.map((component) => {
          const cloned = cloneComponent(component);
          if (cloned.quantityPerAssembly !== undefined && cloned.quantityPerAssembly !== null) {
            const quantityValue = Number(cloned.quantityPerAssembly);
            cloned.quantityPerAssembly = Number.isFinite(quantityValue) ? quantityValue : 1;
          }
          return cloned;
        })
      : [];

    return {
      id: project.id,
      metadata,
      components,
    };
  };

  const queueProjectSync = useCallback((projects) => {
    if (!Array.isArray(projects) || projects.length === 0) return;
    const timestamp = new Date().toISOString();
    pendingProjectSyncRef.current = projects.map((project) => ({
      id: project.id,
      metadata: project.metadata,
      components: project.components,
      updated_at: timestamp,
    }));
    if (projectSyncTimeoutRef.current) return;
    projectSyncTimeoutRef.current = setTimeout(async () => {
      const payload = pendingProjectSyncRef.current;
      pendingProjectSyncRef.current = null;
      projectSyncTimeoutRef.current = null;
      if (!payload || payload.length === 0) return;
      try {
        const { error } = await supabase.from("projetos_config").upsert(payload);
        if (error) throw error;
      } catch (err) {
        console.error("Erro ao sincronizar configuracao de projetos com Supabase", err);
      }
    }, PROJECT_SYNC_DEBOUNCE_MS);
  }, []);

  const recordProjectRevision = useCallback(async (project) => {
    if (!project?.id) return;
    try {
      const sanitized = sanitizeProjectForPersistence(project);
      const { data: latest, error: latestError } = await supabase
        .from("projetos_revisoes")
        .select("revision")
        .eq("projeto_id", sanitized.id)
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError && latestError.code !== "PGRST116") throw latestError;

      const nextRevision = (latest?.revision ?? 0) + 1;

      let currentUser = authUser || null;
      if (!currentUser) {
        try {
          const { data, error: getUserError } = await supabase.auth.getUser();
          if (!getUserError) {
            currentUser = data?.user ?? null;
          }
        } catch (innerErr) {
          console.warn("Nao foi possivel obter usuario autenticado para registrar revisao.", innerErr);
        }
      }

      const userEmail =
        typeof currentUser?.email === "string" && currentUser.email ? currentUser.email : null;
      const rawName = currentUser?.user_metadata?.full_name;
      const userName =
        typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;

      const { data, error } = await supabase
        .from("projetos_revisoes")
        .insert({
          projeto_id: sanitized.id,
          revision: nextRevision,
          metadata: sanitized.metadata,
          components: sanitized.components,
          software_path: sanitized.metadata.softwareFilePath ?? null,
          created_by: currentUser?.id ?? null,
          created_by_email: userEmail,
          created_by_name: userName,
        })
        .select(
          "id, revision, created_at, created_by, created_by_name, created_by_email, software_path, metadata",
        )
        .single();

      if (error) throw error;

      setProjectRevisions((current) => {
        const formatted = mapRevisionRow(data);
        const filtered = current.filter((revision) => revision.id !== formatted.id);
        return [formatted, ...filtered].slice(0, 20);
      });
    } catch (err) {
      console.error("Erro ao registrar revisao de projeto", err);
    }
  }, [authUser]);

  const persistProjectState = (projects, { syncRemote = true } = {}) => {
    if (typeof window === "undefined") return;
    try {
      const serializableProjects = projects.map(sanitizeProjectForPersistence);
      const payload = serializableProjects.reduce((acc, project) => {
        acc[project.id] = {
          metadata: project.metadata,
          components: project.components,
        };
        return acc;
      }, {});
      const serialized = JSON.stringify(payload);
      window.localStorage.setItem(PROJECT_STATE_STORAGE_KEY, serialized);
      const valueMap = serializableProjects.reduce((acc, project) => {
        const value = project?.metadata?.projectValue ?? { amount: 0, currency: "BRL" };
        acc[project.id] = {
          amount: Number.isFinite(Number(value.amount)) ? Number(value.amount) : 0,
          currency: value.currency ?? "BRL",
        };
        return acc;
      }, {});
      window.localStorage.setItem(PROJECT_VALUES_STORAGE_KEY, JSON.stringify(valueMap));
      writeProjectStateCookie(serialized);
      if (syncRemote) {
        queueProjectSync(serializableProjects);
      }
    } catch (err) {
      console.error("Erro ao salvar configuracao de projetos", err);
      clearProjectStateCookies();
    }
  };

  useEffect(
    () => () => {
      if (projectSyncTimeoutRef.current) {
        clearTimeout(projectSyncTimeoutRef.current);
        projectSyncTimeoutRef.current = null;
      }
      pendingProjectSyncRef.current = null;
    },
    [],
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
  const [newItemPurchaseLot, setNewItemPurchaseLot] = useState("");
  const [newItemMoq, setNewItemMoq] = useState("");
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [newItemFeedback, setNewItemFeedback] = useState({ type: null, message: "" });
  const [hasEditAccess, setHasEditAccess] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState(null);
  const [reservationStatus, setReservationStatus] = useState({ type: null, message: "" });
  const [isFinalizingReservations, setIsFinalizingReservations] = useState(false);
  const [isUploadingSoftware, setIsUploadingSoftware] = useState(false);
  const [softwareUploadStatus, setSoftwareUploadStatus] = useState({ type: null, message: "" });
  const [isUploadingGerber, setIsUploadingGerber] = useState(false);
  const [gerberUploadStatus, setGerberUploadStatus] = useState({ type: null, message: "" });
  const [projectRevisions, setProjectRevisions] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [recentDocumentsError, setRecentDocumentsError] = useState(null);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState(null);
  const [exchangeRates, setExchangeRates] = useState({ BRL: 1, USD: DEFAULT_USD_RATE });
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
    let isActive = true;

    const loadRecentDocuments = async () => {
      try {
        const { data, error } = await supabase
          .from("documentos")
          .select("id, name, category, storage_path, created_at")
          .order("created_at", { ascending: false })
          .limit(3);
        if (error) throw error;

        const withUrls = await Promise.all(
          (data ?? []).map(async (doc) => {
            const { data: signed, error: signedError } = await supabase.storage
              .from(COMPANY_DOCUMENTS_BUCKET)
              .createSignedUrl(doc.storage_path, FILE_SIGNED_URL_TTL);
            if (signedError) {
              console.warn("Nao foi possivel gerar link do documento recente.", signedError);
            }
            return {
              ...doc,
              downloadUrl: signed?.signedUrl ?? null,
            };
          }),
        );

        if (!isActive) return;
        setRecentDocuments(withUrls);
        setRecentDocumentsError(null);
      } catch (err) {
        if (!isActive) return;
        setRecentDocuments([]);
        setRecentDocumentsError(err);
      }
    };

    loadRecentDocuments();

    const channel = supabase
      .channel("public:documentos_dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documentos" },
        () => {
          loadRecentDocuments();
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const fetchUsdRate = async () => {
      try {
        const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const bid = Number(data?.USDBRL?.bid);
        if (!isActive) return;
        if (Number.isFinite(bid) && bid > 0) {
          setExchangeRates((current) => ({
            ...current,
            USD: bid,
          }));
        }
      } catch (err) {
        if (isActive) {
          console.warn("Falha ao atualizar taxa USD/BRL.", err);
        }
      }
    };

    fetchUsdRate();
    const interval = setInterval(fetchUsdRate, 60 * 60 * 1000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    if (!selectedProjectId) {
      setProjectRevisions([]);
      return () => {
        isActive = false;
      };
    }

    const loadRevisions = async () => {
      setRevisionsLoading(true);
      setRevisionsError(null);
      try {
        const { data, error } = await supabase
          .from("projetos_revisoes")
          .select(
            "id, revision, created_at, created_by, created_by_name, created_by_email, software_path, metadata",
          )
          .eq("projeto_id", selectedProjectId)
          .order("revision", { ascending: false })
          .limit(20);
        if (error) throw error;
        if (!isActive) return;
        const mapped = (data ?? []).map(mapRevisionRow);
        setProjectRevisions(mapped);
      } catch (err) {
        if (isActive) {
          setRevisionsError(err);
        }
        console.error("Erro ao carregar revisoes de projeto", err);
      } finally {
        if (isActive) {
          setRevisionsLoading(false);
        }
      }
    };

    loadRevisions();

    return () => {
      isActive = false;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    let isActive = true;
    const loadReservations = async () => {
      setReservationsLoading(true);
      setReservationsError(null);
      try {
        const { data, error } = await supabase
          .from("reservas_estoque")
          .select("*")
          .eq("status", "pendente");
        if (error) throw error;
        if (!isActive) return;
        const mapped = (data ?? []).map(mapReservationRow);
        setReservations(mapped);
      } catch (err) {
        if (isActive) {
          setReservationsError(err);
        }
        console.error("Erro ao carregar reservas de estoque", err);
      } finally {
        if (isActive) {
          setReservationsLoading(false);
        }
      }
    };

    loadReservations();

    return () => {
      isActive = false;
    };
  }, []);

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

              const savedMetadata = formatProjectMetadata({
                ...project.metadata,
                ...(saved.metadata ?? {}),
              });

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
            persistProjectState(next, { syncRemote: false });
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

              const savedMetadata = formatProjectMetadata({
                ...project.metadata,
                ...(saved.metadata ?? {}),
              });

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
            persistProjectState(next, { syncRemote: false });
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
            const next = current.map((project) => {
              const storedValue = parsedValues[project.id];
              let normalizedValue = project.metadata.projectValue;
              if (typeof storedValue === "number") {
                normalizedValue = { amount: storedValue, currency: "BRL" };
              } else if (storedValue && typeof storedValue === "object") {
                const amount = Number(storedValue.amount ?? storedValue.value ?? 0);
                const currency =
                  typeof storedValue.currency === "string"
                    ? storedValue.currency.toUpperCase()
                    : typeof storedValue.moeda === "string"
                      ? storedValue.moeda.toUpperCase()
                      : "BRL";
                normalizedValue = {
                  amount: Number.isFinite(amount) ? amount : 0,
                  currency,
                };
              }
              return {
                ...project,
                metadata: formatProjectMetadata({
                  ...project.metadata,
                  projectValue: normalizedValue,
                }),
              };
            });
            persistProjectState(next, { syncRemote: false });
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar configuracao de projetos", err);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadProjectsFromSupabase = async () => {
      try {
        const { data, error } = await supabase.from("projetos_config").select("*");
        if (error) throw error;
        if (!data || data.length === 0 || !isActive) return;

        setProjectOptions((current) => {
          const recordMap = new Map();
          data.forEach((row) => {
            if (row?.id) recordMap.set(row.id, row);
          });
          if (recordMap.size === 0) return current;

          const next = current.map((project) => {
            const record = recordMap.get(project.id);
            if (!record) return project;

            const mergedMetadata = formatProjectMetadata({
              ...project.metadata,
              ...(record.metadata ?? {}),
            });

            const storedComponents = Array.isArray(record.components)
              ? record.components.map((component) => {
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

            const resolvedName =
              typeof mergedMetadata.name === "string" && mergedMetadata.name.trim()
                ? mergedMetadata.name
                : project.name;

            return {
              ...project,
              name: resolvedName,
              metadata: mergedMetadata,
              components: storedComponents,
            };
          });

          persistProjectState(next, { syncRemote: false });
          return next;
        });
      } catch (err) {
        console.error("Erro ao carregar configuracao de projetos do Supabase", err);
      }
    };

    loadProjectsFromSupabase();

    return () => {
      isActive = false;
    };
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

  const reservedByItem = useMemo(() => {
    const map = new Map();
    reservations.forEach((reservation) => {
      if ((reservation.status ?? "pendente") !== "pendente") return;
      if (!reservation.itemId) return;
      const key = String(reservation.itemId);
      const quantity = Number(reservation.quantidade ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      map.set(key, (map.get(key) ?? 0) + quantity);
    });
    return map;
  }, [reservations]);

  const pendingReservationsForProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return reservations.filter(
      (reservation) =>
        reservation.projetoId === selectedProjectId &&
        (reservation.status ?? "pendente") === "pendente",
    );
  }, [reservations, selectedProjectId]);

  const reservationSummary = useMemo(() => {
    if (!pendingReservationsForProject.length) {
      return { totalReservations: 0, totalQuantity: 0, entries: [] };
    }
    const aggregated = new Map();
    pendingReservationsForProject.forEach((reservation) => {
      if (!reservation.itemId) return;
      const key = String(reservation.itemId);
      const quantity = Number(reservation.quantidade ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const entry = aggregated.get(key) ?? { itemId: key, quantity: 0 };
      entry.quantity += quantity;
      aggregated.set(key, entry);
    });
    const entries = Array.from(aggregated.values()).map((entry) => {
      const item = idIndex.get(entry.itemId);
      return {
        itemId: entry.itemId,
        quantity: entry.quantity,
        itemName: item?.name ?? "Item removido",
        itemCode: item?.code ?? null,
      };
    });
    const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    return {
      totalReservations: pendingReservationsForProject.length,
      totalQuantity,
      entries,
    };
  }, [pendingReservationsForProject, idIndex]);

  const createReservationsForReport = useCallback(
    async (reportItems) => {
      if (!canManageProjects || !selectedProjectId) return [];

      const aggregate = reportItems.reduce((acc, item) => {
        const itemId = item.inventoryItemId ? String(item.inventoryItemId) : null;
        if (!itemId) return acc;
        const required = Number(item.required ?? 0);
        const available = Number(item.available ?? 0);
        if (!Number.isFinite(required) || required <= 0) return acc;
        if (!Number.isFinite(available) || available <= 0) return acc;
        const reservable = Math.min(required, available);
        if (reservable <= 0) return acc;
        acc.set(itemId, (acc.get(itemId) ?? 0) + reservable);
        return acc;
      }, new Map());

      if (aggregate.size === 0) return [];

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = Array.from(aggregate.entries()).map(([itemId, quantity]) => ({
        item_id: itemId,
        projeto_id: selectedProjectId,
        quantidade: quantity,
        status: "pendente",
        created_by: user?.id ?? null,
      }));

      const { data, error } = await supabase
        .from("reservas_estoque")
        .insert(payload)
        .select("*");
      if (error) throw error;

      const mapped = (data ?? []).map(mapReservationRow);
      setReservations((current) => [...mapped, ...current]);
      return mapped;
    },
    [canManageProjects, selectedProjectId],
  );

  const convertCurrency = useCallback(
    (amount, fromCurrency, toCurrency) => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount)) return 0;
      const from = typeof fromCurrency === "string" ? fromCurrency.toUpperCase() : "BRL";
      const to = typeof toCurrency === "string" ? toCurrency.toUpperCase() : "BRL";
      if (from === to) return numericAmount;
      const fromRate = Number(exchangeRates[from] ?? 1);
      const toRate = Number(exchangeRates[to] ?? 1);
      const baseAmount = numericAmount * (Number.isFinite(fromRate) && fromRate > 0 ? fromRate : 1);
      const divisor = Number.isFinite(toRate) && toRate > 0 ? toRate : 1;
      return baseAmount / divisor;
    },
    [exchangeRates],
  );

  const projectValueSummary = useMemo(() => {
    const value = selectedProject?.metadata?.projectValue ?? { amount: 0, currency: "BRL" };
    const amountNumeric = Number(value.amount ?? 0);
    const amount = Number.isFinite(amountNumeric) ? amountNumeric : 0;
    const currency = typeof value.currency === "string" ? value.currency.toUpperCase() : "BRL";
    return {
      amount,
      currency,
      conversions: {
        BRL: convertCurrency(amount, currency, "BRL"),
        USD: convertCurrency(amount, currency, "USD"),
      },
    };
  }, [selectedProject?.metadata?.projectValue, convertCurrency]);

  const projectValueCurrency = (
    isEditingProject ? draftProject?.metadata?.projectValueCurrency : projectValueSummary.currency
  ) ?? "BRL";

  const projectValueAmountInput = isEditingProject
    ? draftProject?.metadata?.projectValueAmountInput ?? ""
    : String(projectValueSummary.amount ?? 0);
  const inventorySelectionItems = useMemo(() => sortInventoryItems(items), [items]);

  const findInventoryMatch = (component, preferredTerm) => {
    const directMatch = component.inventoryItemId
      ? idIndex.get(String(component.inventoryItemId)) ?? null
      : null;

    if (directMatch) return directMatch;

    const prioritizedCodes = [
      component.code,
      component.inventoryCode,
      component.catalogCode,
      component.legacyCode,
    ];
    for (const codeCandidate of prioritizedCodes) {
      const normalizedCode = normalize(codeCandidate);
      if (!normalizedCode) continue;
      const codeMatch = nameIndex.get(normalizedCode);
      if (codeMatch) return codeMatch;
    }

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
      const componentValueRaw = component.value ?? component.inventoryName ?? component.name ?? "";
      const normalizedValue = componentValueRaw.trim();

      const rawItemId =
        component.inventoryItemId !== undefined && component.inventoryItemId !== null
          ? String(component.inventoryItemId)
          : match
            ? String(match.id)
            : "";

      const availableBaseRaw = Number(match?.quantity ?? component.availableQuantity ?? 0);
      const availableBase = Number.isFinite(availableBaseRaw) ? availableBaseRaw : 0;
      const reservedAmount = Number(reservedByItem.get(rawItemId) ?? 0);
      const available = Math.max(0, availableBase - reservedAmount);

      const quantityPerAssemblyRaw = Number(component.quantityPerAssembly ?? 1);
      const quantityPerAssembly =
        Number.isFinite(quantityPerAssemblyRaw) && quantityPerAssemblyRaw > 0
          ? quantityPerAssemblyRaw
          : 1;

      return {
        ...component,
        inventoryItemId: rawItemId,
        value: normalizedValue,
        quantityPerAssembly,
        available,
        reserved: reservedAmount,
        inventoryName: component.inventoryName?.trim()
          ? component.inventoryName
          : match?.name ?? component.value,
      };
    });
  }, [projectCatalog, nameIndex, idIndex, inventorySelectionItems, reservedByItem]);

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

  useEffect(() => {
    if (!reservationStatus.type) return undefined;
    const timeout = setTimeout(
      () => setReservationStatus({ type: null, message: "" }),
      4000,
    );
    return () => clearTimeout(timeout);
  }, [reservationStatus]);

  useEffect(() => {
    if (!softwareUploadStatus.type) return undefined;
    const timeout = setTimeout(
      () => setSoftwareUploadStatus({ type: null, message: "" }),
      4000,
    );
    return () => clearTimeout(timeout);
  }, [softwareUploadStatus]);

  useEffect(() => {
    if (!gerberUploadStatus.type) return undefined;
    const timeout = setTimeout(
      () => setGerberUploadStatus({ type: null, message: "" }),
      4000,
    );
    return () => clearTimeout(timeout);
  }, [gerberUploadStatus]);

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
  const baseMetadata = formatProjectMetadata(selectedProject.metadata ?? {});
  const metadata = {
    name: baseMetadata.name ?? "",
    customer: baseMetadata.customer ?? "",
    finishedBoardCode: baseMetadata.finishedBoardCode ?? "",
    notes: baseMetadata.notes ?? "",
    observation: baseMetadata.observation ?? "",
    pcbVersion: baseMetadata.pcbVersion ?? "",
    softwareName: baseMetadata.softwareName ?? "",
    softwareFilePath: baseMetadata.softwareFilePath ?? null,
    gerberName: baseMetadata.gerberName ?? "",
    gerberFilePath: baseMetadata.gerberFilePath ?? null,
    projectValueAmountInput:
      baseMetadata.projectValue && Number.isFinite(Number(baseMetadata.projectValue.amount))
        ? String(baseMetadata.projectValue.amount)
        : "",
    projectValueCurrency: baseMetadata.projectValue?.currency ?? "BRL",
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
    const numericValue = Number(sanitized);
    const amount = rawValue.trim() === "" || !Number.isFinite(numericValue) ? 0 : numericValue;

    const activeCurrency =
      (isEditingProject && draftProject?.metadata?.projectValueCurrency) ||
      selectedProject?.metadata?.projectValue?.currency ||
      "BRL";

    setProjectOptions((current) => {
      const next = current.map((project) =>
        project.id === selectedProjectId
          ? {
              ...project,
              metadata: formatProjectMetadata({
                ...project.metadata,
                projectValue: {
                  amount,
                  currency: activeCurrency,
                },
              }),
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
              metadata: {
                ...current.metadata,
                projectValueAmountInput: rawValue,
              },
            }
          : current,
      );
    }
  };

  const handleProjectCurrencyChange = (nextCurrency) => {
    const normalizedCurrency = typeof nextCurrency === "string" ? nextCurrency.toUpperCase() : "BRL";
    const currentAmount = (() => {
      if (isEditingProject) {
        const raw = draftProject?.metadata?.projectValueAmountInput;
        if (typeof raw === "string" && raw.trim()) {
          const numeric = Number(raw.replace(",", "."));
          if (Number.isFinite(numeric)) return numeric;
        }
      }
      return selectedProject?.metadata?.projectValue?.amount ?? 0;
    })();

    setProjectOptions((current) => {
      const next = current.map((project) =>
        project.id === selectedProjectId
          ? {
              ...project,
              metadata: formatProjectMetadata({
                ...project.metadata,
                projectValue: {
                  amount: currentAmount,
                  currency: normalizedCurrency,
                },
              }),
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
              metadata: {
                ...current.metadata,
                projectValueCurrency: normalizedCurrency,
              },
            }
          : current,
      );
    }
  };

  const handleSoftwareUpload = async (file) => {
    if (!canManageProjects || !file || !isEditingProject || !draftProject || !selectedProjectId) {
      return;
    }
    setSoftwareUploadStatus({ type: null, message: "" });
    setIsUploadingSoftware(true);
    try {
      const timestamp = Date.now();
      const originalName = file.name || `software-${timestamp}.bin`;
      const extensionMatch = originalName.match(/\.([^.]+)$/);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "bin";
      const baseName = extensionMatch
        ? originalName.slice(0, -(extension.length + 1))
        : originalName;
      const sanitizedBase = sanitizeStorageFileName(baseName) || `software-${timestamp}`;
      const storagePath = `${selectedProjectId}/${timestamp}-${sanitizedBase}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(PROJECT_SOFTWARE_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;

      setDraftProject((current) => {
        if (!current) return current;
        const currentName = current.metadata?.softwareName ?? "";
        const shouldAutoName = !currentName || !currentName.trim();
        return {
          ...current,
          metadata: {
            ...current.metadata,
            softwareFilePath: storagePath,
            softwareName: shouldAutoName ? originalName : currentName,
          },
        };
      });

      setSoftwareUploadStatus({
        type: "success",
        message: "Arquivo enviado. Salve o projeto para confirmar a nova versao.",
      });
    } catch (err) {
      console.error("Falha ao enviar arquivo de software", err);
      setSoftwareUploadStatus({
        type: "error",
        message:
          err?.message ??
          "Nao foi possivel enviar o arquivo. Verifique se o bucket de armazenamento existe.",
      });
    } finally {
      setIsUploadingSoftware(false);
    }
  };

  const handleRemoveSoftwareFile = () => {
    if (!canManageProjects || !isEditingProject || !draftProject) return;
    if (!draftProject.metadata?.softwareFilePath) return;
    setDraftProject((current) =>
      current
        ? {
            ...current,
            metadata: {
              ...current.metadata,
              softwareFilePath: null,
            },
          }
        : current,
    );
    setSoftwareUploadStatus({
      type: "success",
      message: "Arquivo sera removido apos salvar o projeto.",
      });
    };

  const handleGerberUpload = async (file) => {
    if (!canManageProjects || !file || !isEditingProject || !draftProject || !selectedProjectId) {
      return;
    }
    setGerberUploadStatus({ type: null, message: "" });
    setIsUploadingGerber(true);
    try {
      const timestamp = Date.now();
      const originalName = file.name || `gerber-${timestamp}.zip`;
      const extensionMatch = originalName.match(/\.([^.]+)$/);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "zip";
      const baseName = extensionMatch
        ? originalName.slice(0, -(extension.length + 1))
        : originalName;
      const sanitizedBase =
        sanitizeStorageFileName(baseName, "gerber") || `gerber-${timestamp}`;
      const storagePath = `${selectedProjectId}/${timestamp}-${sanitizedBase}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(PROJECT_GERBER_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;

      setDraftProject((current) => {
        if (!current) return current;
        const currentName = current.metadata?.gerberName ?? "";
        const shouldAutoName = !currentName || !currentName.trim();
        return {
          ...current,
          metadata: {
            ...current.metadata,
            gerberFilePath: storagePath,
            gerberName: shouldAutoName ? originalName : currentName,
          },
        };
      });

      setGerberUploadStatus({
        type: "success",
        message: "Gerber enviado. Salve o projeto para confirmar a nova versao.",
      });
    } catch (err) {
      console.error("Falha ao enviar arquivo Gerber", err);
      setGerberUploadStatus({
        type: "error",
        message:
          err?.message ??
          "Nao foi possivel enviar o arquivo. Verifique se o bucket de armazenamento existe.",
      });
    } finally {
      setIsUploadingGerber(false);
    }
  };

  const handleRemoveGerberFile = () => {
    if (!canManageProjects || !isEditingProject || !draftProject) return;
    if (!draftProject.metadata?.gerberFilePath) return;
    setDraftProject((current) =>
      current
        ? {
            ...current,
            metadata: {
              ...current.metadata,
              gerberFilePath: null,
            },
          }
        : current,
    );
    setGerberUploadStatus({
      type: "success",
      message: "Gerber sera removido apos salvar o projeto.",
    });
  };

  const handleDownloadSoftwareFile = async (path) => {
    if (!path) {
      notifyWarning("Nenhum arquivo de software cadastrado para este projeto.");
      return;
    }
    try {
      const { data, error } = await supabase
        .storage
        .from(PROJECT_SOFTWARE_BUCKET)
        .createSignedUrl(path, FILE_SIGNED_URL_TTL);
      if (error) throw error;
      const url = data?.signedUrl;
      if (url) {
        window.open(url, "_blank", "noopener");
      }
    } catch (err) {
      console.error("Erro ao gerar link de download do software", err);
      setSoftwareUploadStatus({
        type: "error",
        message:
          err?.message ??
            "Nao foi possivel gerar o link de download. Verifique se o arquivo ainda existe.",
        });
      }
    };

  const handleDownloadGerberFile = async (path) => {
    if (!path) {
      notifyWarning("Nenhum arquivo Gerber cadastrado para este projeto.");
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from(PROJECT_GERBER_BUCKET)
        .createSignedUrl(path, FILE_SIGNED_URL_TTL);
      if (error) throw error;
      const url = data?.signedUrl;
      if (url) {
        window.open(url, "_blank", "noopener");
      }
    } catch (err) {
      console.error("Erro ao gerar link de download do Gerber", err);
      setGerberUploadStatus({
        type: "error",
        message:
          err?.message ??
          "Nao foi possivel gerar o link de download. Verifique se o arquivo ainda existe.",
      });
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

    const purchaseLotNumber =
      newItemPurchaseLot === "" ? null : Number(newItemPurchaseLot);
    if (
      purchaseLotNumber !== null &&
      (!Number.isFinite(purchaseLotNumber) || purchaseLotNumber <= 0)
    ) {
      setNewItemFeedback({
        type: "error",
        message: "Informe um lote de compra valido (maior que zero).",
      });
      return;
    }

    const moqNumber = newItemMoq === "" ? null : Number(newItemMoq);
    if (moqNumber !== null && (!Number.isFinite(moqNumber) || moqNumber <= 0)) {
      setNewItemFeedback({
        type: "error",
        message: "Informe um MOQ valido (maior que zero).",
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
    if (purchaseLotNumber !== null) payload.purchaseLot = Math.round(purchaseLotNumber);
    if (moqNumber !== null) payload.minimumOrderQuantity = Math.round(moqNumber);

    try {
      setIsCreatingItem(true);
      setNewItemFeedback({ type: null, message: "" });

      const createdItem = await addItem(payload);
      setNewItemFeedback({
        type: "success",
        message: `Componente cadastrado no estoque${
          finalCode ? ` com o cÃ³digo ${finalCode}` : ""
        }.`,
      });

      setNewItemCode("");
      setNewItemName("");
      setNewItemDescription("");
      setNewItemQuantity("");
      setNewItemLocation("");
      setNewItemPurchaseLot("");
      setNewItemMoq("");
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

            const normalizedTrimmed = normalize(trimmed);
            const previousNormalized = normalize(
              component.inventoryName ?? component.value ?? "",
            );
            if (normalizedTrimmed && normalizedTrimmed !== previousNormalized) {
              lookupComponent.inventoryItemId = "";
            }

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

  const handleSaveProject = async () => {
    if (!canManageProjects) {
      notifyError("Voce nao tem permissao para salvar alteracoes de projetos.");
      return;
    }
    if (!draftProject) return;

    const previousSoftwarePath = selectedProject?.metadata?.softwareFilePath ?? null;
    const previousGerberPath = selectedProject?.metadata?.gerberFilePath ?? null;

    const {
      projectValueAmountInput = "",
      projectValueCurrency = selectedProject?.metadata?.projectValue?.currency ?? "BRL",
      ...restDraftMetadata
    } = draftProject.metadata ?? {};

    const normalizedAmount = (() => {
      if (typeof projectValueAmountInput === "string" && projectValueAmountInput.trim()) {
        const numeric = Number(projectValueAmountInput.replace(",", "."));
        if (Number.isFinite(numeric)) return numeric;
      }
      return selectedProject?.metadata?.projectValue?.amount ?? 0;
    })();

    const sanitizedMetadata = formatProjectMetadata({
      ...restDraftMetadata,
      projectValue: {
        amount: normalizedAmount,
        currency:
          typeof projectValueCurrency === "string"
            ? projectValueCurrency.toUpperCase()
            : "BRL",
      },
    });
    if (!sanitizedMetadata.name) {
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

    const updatedProject = {
      id: selectedProjectId,
      name: sanitizedMetadata.name,
      metadata: sanitizedMetadata,
      components: sanitizedComponents,
    };

    setProjectOptions((current) => {
      const next = current.map((project) => {
        if (project.id !== selectedProjectId) return project;
        return {
          ...project,
          name: updatedProject.name,
          metadata: updatedProject.metadata,
          components: updatedProject.components,
        };
      });
      persistProjectState(next);
      return next;
    });

      await recordProjectRevision(updatedProject);

      const newSoftwarePath = sanitizedMetadata.softwareFilePath ?? null;
      if (
        previousSoftwarePath &&
        previousSoftwarePath !== newSoftwarePath &&
        PROJECT_SOFTWARE_BUCKET
      ) {
        try {
          await supabase.storage
            .from(PROJECT_SOFTWARE_BUCKET)
            .remove([previousSoftwarePath]);
        } catch (err) {
          console.warn("Nao foi possivel remover o arquivo de software anterior.", err);
        }
      }

      const newGerberPath = sanitizedMetadata.gerberFilePath ?? null;
      if (
        previousGerberPath &&
        previousGerberPath !== newGerberPath &&
        PROJECT_GERBER_BUCKET
      ) {
        try {
          await supabase.storage
            .from(PROJECT_GERBER_BUCKET)
            .remove([previousGerberPath]);
        } catch (err) {
          console.warn("Nao foi possivel remover o arquivo Gerber anterior.", err);
        }
      }
    setIsEditingProject(false);
    setDraftProject(null);
  };

  const handleGeneratePurchaseReport = async () => {
    const requestedQuantity = Number(boardsToProduce);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      notifyWarning("Informe uma quantidade valida de placas.");
      return;
    }
    if (!selectedProjectId) {
      notifyWarning("Selecione um projeto antes de gerar o relatório.");
      return;
    }

    const bomComponents = Array.isArray(selectedProject?.components)
      ? selectedProject.components
      : [];
    if (!bomComponents.length) {
      notifyWarning("Nenhum componente listado para este projeto.");
      return;
    }

    const aggregated = new Map();
    bomComponents.forEach((component, index) => {
      const normalizedValue = normalize(
        component.value ??
          component.inventoryName ??
          component.name ??
          component.description ??
          component.code ??
          "",
      );
      const normalizedNomenclature = normalize(component.nomenclature ?? "");
      const keyBase = normalizedValue || normalizedNomenclature;
      const key = keyBase ? `${normalizedValue}|${normalizedNomenclature}` : `component-${index}`;

      const quantityRaw = Number(component.quantityPerAssembly ?? component.perBoard ?? 1);
      const perBoard =
        Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

      const match = findInventoryMatch(
        component,
        component.value ?? component.inventoryName ?? component.name ?? "",
      );
      const itemId = component.inventoryItemId
        ? String(component.inventoryItemId)
        : match
          ? String(match.id)
          : null;

      const baseAvailable =
        itemId && idIndex.has(itemId)
          ? Number(idIndex.get(itemId)?.quantity ?? 0)
          : Number(match?.quantity ?? component.availableQuantity ?? 0);
      const reservedRaw = itemId ? Number(reservedByItem.get(itemId) ?? 0) : 0;
      const available = Math.max(0, Number.isFinite(baseAvailable) ? baseAvailable : 0) - reservedRaw;
      const { purchaseLot, minimumOrderQuantity } = resolvePurchaseConstraints(component, match);

      const name =
        component.inventoryName ??
        component.value ??
        component.name ??
        component.description ??
        "Componente";
      const code =
        component.code ??
        component.catalogCode ??
        component.inventoryCode ??
        match?.code ??
        null;

      const existing = aggregated.get(key);
      if (existing) {
        existing.perBoard += perBoard;
        existing.required += perBoard * requestedQuantity;
        existing.available = Math.min(existing.available, available);
        existing.reserved += reservedRaw;
        existing.purchaseLot = mergePositiveConstraint(existing.purchaseLot, purchaseLot);
        existing.minimumOrderQuantity = mergePositiveConstraint(
          existing.minimumOrderQuantity,
          minimumOrderQuantity,
        );
      } else {
        aggregated.set(key, {
          id: itemId ? `inventory-${itemId}` : `component-${key || Math.random().toString(36).slice(2)}`,
          code,
          name,
          inventoryItemId: itemId,
          perBoard,
          available,
          reserved: reservedRaw,
          required: perBoard * requestedQuantity,
          nomenclature: component.nomenclature ?? "",
          purchaseLot: purchaseLot,
          minimumOrderQuantity,
        });
      }
    });

    const nextItems = Array.from(aggregated.values()).map((entry) => {
      const shortage = Math.max(0, entry.required - entry.available);
      const toBuy = computePurchaseQuantity(
        entry.required,
        entry.available,
        entry.purchaseLot ?? 1,
        entry.minimumOrderQuantity ?? 0,
      );
      return {
        ...entry,
        shortage,
        toBuy,
      };
    });

    setProjectItems(nextItems);
    setGeneratedQuantity(requestedQuantity);

    try {
      const createdReservations = await createReservationsForReport(nextItems);
      const totalReserved = createdReservations.reduce(
        (sum, reservation) => sum + Number(reservation.quantidade ?? 0),
        0,
      );
      if (totalReserved > 0) {
        setReservationStatus({
          type: "success",
          message: `Reservados ${totalReserved.toLocaleString(
            "pt-BR",
          )} itens para o projeto.`,
        });
      } else {
        setReservationStatus({
          type: "info",
          message: "Nenhum componente do estoque estava disponivel para reserva.",
        });
      }
    } catch (err) {
      console.error("Falha ao registrar reservas de estoque", err);
      setReservationStatus({
        type: "error",
        message:
          err?.message ?? "Nao foi possivel reservar os componentes para este projeto.",
      });
    }
  };

  const handleFinalizeReservations = async () => {
    if (!canManageProjects) {
      notifyError("Voce nao tem permissao para alterar as reservas.");
      return;
    }
    if (!selectedProjectId) {
      notifyWarning("Selecione um projeto para consumir as reservas.");
      return;
    }

    const pending = pendingReservationsForProject;
    if (!pending.length) {
      notifyWarning("Nao existem reservas pendentes para este projeto.");
      return;
    }

    setIsFinalizingReservations(true);
    try {
      const aggregated = pending.reduce((acc, reservation) => {
        if (!reservation.itemId) return acc;
        const key = String(reservation.itemId);
        const quantity = Number(reservation.quantidade ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) return acc;
        acc.set(key, (acc.get(key) ?? 0) + quantity);
        return acc;
      }, new Map());

      if (aggregated.size === 0) {
        setReservationStatus({
          type: "info",
          message: "Nenhuma reserva valida para consumir.",
        });
        setIsFinalizingReservations(false);
        return;
      }

      const consumedAt = new Date().toISOString();
      const historyReason = `Consumo projeto ${selectedProject?.metadata?.name ?? selectedProjectId}`;

      for (const [itemId, quantity] of aggregated) {
        const item = idIndex.get(itemId);
        if (!item) continue;
        const numericQuantity = Number(quantity);
        if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) continue;

        const currentQuantity = Number(item.quantity ?? 0);
        const nextQuantity = Math.max(0, currentQuantity - numericQuantity);
        const updatedItem = await updateItem(item.id, { quantity: nextQuantity });
        const resultingQuantity = Number(updatedItem?.quantity ?? nextQuantity);

        const historyPayload = {
          item_id: item.id,
          action: "remove",
          quantity: numericQuantity,
          resulting_quantity: resultingQuantity,
          component_name: item.name,
          component_code: item.code ?? null,
          reason: historyReason,
        };

        const { data: historyEntry, error: historyError } = await supabase
          .from("historico_estoque")
          .insert(historyPayload)
          .select("*")
          .single();

        if (historyError) {
          console.error("Falha ao registrar consumo no historico", historyError);
        } else if (historyEntry) {
          setStockHistory((current) => [historyEntry, ...current]);
        }
      }

      const reservationIds = pending.map((reservation) => reservation.id);
      const { error: updateError } = await supabase
        .from("reservas_estoque")
        .update({ status: "consumida", consumido_em: consumedAt })
        .in("id", reservationIds);
      if (updateError) throw updateError;

      setReservations((current) =>
        current.filter((reservation) => !reservationIds.includes(reservation.id)),
      );
      setReservationStatus({
        type: "success",
        message: "Reservas consumidas e estoque atualizado com sucesso.",
      });
    } catch (err) {
      console.error("Erro ao consumir reservas de estoque", err);
      setReservationStatus({
        type: "error",
        message: err?.message ?? "Nao foi possivel consumir as reservas deste projeto.",
      });
    } finally {
      setIsFinalizingReservations(false);
    }
  };

  const handleDownloadReport = () => {
    if (!projectItems.length) {
      notifyWarning("Gere o relatório antes de exportar.");
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
      : "Quantidade nÃ£o informada";

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
    onProjectCurrencyChange: handleProjectCurrencyChange,
    projectValueSummary,
    projectValueCurrency,
    projectValueAmountInput,
    currencyOptions: SUPPORTED_CURRENCIES,
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
    onSoftwareUpload: handleSoftwareUpload,
    onRemoveSoftwareFile: handleRemoveSoftwareFile,
    onDownloadSoftware: handleDownloadSoftwareFile,
    isUploadingSoftware,
    softwareUploadStatus,
    onGerberUpload: handleGerberUpload,
    onRemoveGerberFile: handleRemoveGerberFile,
    onDownloadGerber: handleDownloadGerberFile,
    isUploadingGerber,
    gerberUploadStatus,
    revisions: projectRevisions,
    revisionsLoading,
    revisionsError,
    reservationsLoading,
    reservationsError,
    reservationStatus,
    reservationSummary,
    onFinalizeReservations: handleFinalizeReservations,
    isFinalizingReservations,
  };

  const reportsTabProps = {
    purchaseCandidates: projectItems,
    generatedQuantity,
    selectedProject,
    items,
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
    newItemPurchaseLot,
    onNewItemPurchaseLotChange: setNewItemPurchaseLot,
    newItemMoq,
    onNewItemMoqChange: setNewItemMoq,
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

      {recentDocuments.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Documentos recentes</p>
              <h2 className="text-lg font-semibold text-slate-800">Arquivos adicionados recentemente</h2>
            </div>
            <a
              href="/documentos"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Ver todos
            </a>
          </div>
          {recentDocumentsError && (
            <p className="mt-3 text-xs text-amber-600">Nao foi possivel atualizar a lista de documentos. Exibindo os ultimos itens em cache.</p>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {recentDocuments.map((doc) => (
              <div key={doc.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {doc.category || "Documento"}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-2 text-slate-800">
                    <span aria-hidden="true" className="inline-flex h-6 w-10 items-center justify-center rounded border border-slate-200 bg-white text-[11px] font-semibold uppercase text-slate-500">{resolveDocumentIcon(doc.mime_type, doc.name || doc.storage_path)}</span>
                    <span className="font-semibold">{doc.name}</span>
                  </p>
                </div>
                <p className="text-[11px] text-slate-400">Enviado em {formatDateTime(doc.created_at)}</p>
                <div className="flex gap-2">
                  {doc.downloadUrl ? (
                    <a
                      href={doc.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      Abrir
                    </a>
                  ) : (
                    <span className="text-[11px] text-amber-600">Link indisponível</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
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
            return <ReportsTab {...reportsTabProps} />;
          default:
            return <ProjectsTab {...projectsTabProps} />;
        }
      })()}
    </div>
  );
}





















