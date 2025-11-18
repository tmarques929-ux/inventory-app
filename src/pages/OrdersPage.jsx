import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import WltLogoMark from "../components/WltLogoMark";
import { useValueVisibility } from "../context/ValueVisibilityContext";
import { useProjectCatalog } from "../hooks/useProjectCatalog";

const ORDER_PHASES = [
  {
    value: "em_processo",
    label: "Em processo",
    badgeClass: "bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-300",
  },
  {
    value: "esperando_componentes",
    label: "Esperando componentes",
    badgeClass: "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300",
  },
  {
    value: "pronto_envio",
    label: "Pronto para envio",
    badgeClass: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300",
  },
  {
    value: "entregue",
    label: "Entregue",
    badgeClass: "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-300",
  },
];

const ORDER_PHASE_LOOKUP = ORDER_PHASES.reduce((acc, phase) => {
  acc[phase.value] = phase;
  return acc;
}, {});
// Mantem compatibilidade com registros antigos que usavam "finalizado".
ORDER_PHASE_LOOKUP.finalizado = ORDER_PHASE_LOOKUP.entregue;
const DEFAULT_ORDER_PHASE = ORDER_PHASES[0].value;

const initialForm = {
  nfe: "",
  contatoId: "",
  quantidade: "",
  projetoId: "",
  dataPedido: "",
  dataEntrega: "",
  ajusteValor: "",
  observacoes: "",
  nfeUrl: "",
  fase: DEFAULT_ORDER_PHASE,
};

const NFE_BUCKET = "nfes";
const MAX_NFE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_NFE_TYPES = ["application/pdf", "application/xml", "text/xml"];
const PROJECT_VALUES_STORAGE_KEY = "inventory-app-project-values";

const DEFAULT_USD_RATE_SEED = Number(import.meta.env.VITE_USD_EXCHANGE_RATE ?? "5");
const DEFAULT_USD_RATE =
  Number.isFinite(DEFAULT_USD_RATE_SEED) && DEFAULT_USD_RATE_SEED > 0 ? DEFAULT_USD_RATE_SEED : 5;

const convertToBRL = (amount, currency = "BRL") => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  const normalizedCurrency = typeof currency === "string" ? currency.trim().toUpperCase() : "BRL";
  switch (normalizedCurrency) {
    case "USD":
      return numeric * DEFAULT_USD_RATE;
    default:
      return numeric;
  }
};

const normalizeProjectValueObject = (value) => {
  if (value && typeof value === "object") {
    const amount = Number(value.amount ?? value.value ?? value.valor ?? 0);
    const rawCurrency = value.currency ?? value.moeda ?? value.currencyCode ?? "BRL";
    const currency = typeof rawCurrency === "string" ? rawCurrency.trim().toUpperCase() : "BRL";
    return {
      amount: Number.isFinite(amount) ? amount : 0,
      currency: currency || "BRL",
    };
  }
  const numeric = Number(value);
  return {
    amount: Number.isFinite(numeric) ? numeric : 0,
    currency: "BRL",
  };
};

const normalizeProjectValueToBRL = (value) => {
  if (value && typeof value === "object") {
    const amount = value.amount ?? value.value ?? value.valor ?? 0;
    const currency = value.currency ?? value.moeda ?? value.currencyCode ?? "BRL";
    return convertToBRL(amount, currency);
  }
  return convertToBRL(value, "BRL");
};
const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );

const parseDateStrict = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const formatIsoDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : parseDateStrict(value);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (value) => {
  const parsed = parseDateStrict(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "-";
};

export default function OrdersPage() {
  const { maskValue } = useValueVisibility();
  const { projects: catalogProjects } = useProjectCatalog();
  const [form, setForm] = useState(initialForm);
  const [orders, setOrders] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [projectPrices, setProjectPrices] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [nfeFile, setNfeFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(() => Date.now());
  const [downloadingId, setDownloadingId] = useState(null);
  const [removeExistingNfe, setRemoveExistingNfe] = useState(false);
  const [phaseUpdatingId, setPhaseUpdatingId] = useState(null);

  const contactMap = useMemo(() => {
    return contacts.reduce((acc, contact) => {
      acc[contact.id] = contact;
      return acc;
    }, {});
  }, [contacts]);

  const clientContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const type = typeof contact.tipo === "string" ? contact.tipo.toLowerCase() : "";
      return type.includes("cliente");
    });
  }, [contacts]);

  const selectedContact = form.contatoId ? contactMap[form.contatoId] : null;

  const nextNfeNumber = useMemo(() => {
    const numericNfes = orders.reduce((acc, order) => {
      const nfeString = String(order.nfe ?? "").trim();
      if (/^\d+$/.test(nfeString)) {
        acc.push(Number.parseInt(nfeString, 10));
      }
      return acc;
    }, []);

    if (numericNfes.length === 0) return 1;
    return Math.max(...numericNfes) + 1;
  }, [orders]);

  useEffect(() => {
    if (editingId) return;
    setForm((prev) => {
      const current = typeof prev.nfe === "string" ? prev.nfe.trim() : "";

      if (!current) {
        return { ...prev, nfe: String(nextNfeNumber) };
      }

      if (/^\d+$/.test(current)) {
        const currentNumber = Number.parseInt(current, 10);
        if (Number.isFinite(currentNumber) && currentNumber < nextNfeNumber) {
          return { ...prev, nfe: String(nextNfeNumber) };
        }
      }

      return prev;
    });
  }, [nextNfeNumber, editingId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(PROJECT_VALUES_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            const normalized = Object.entries(parsed).reduce((acc, [projectId, value]) => {
              acc[projectId] = normalizeProjectValueToBRL(value);
              return acc;
            }, {});
            setProjectPrices(normalized);
          }
        }
      } catch (err) {
        console.error("Não foi possível carregar valores de projetos", err);
      }
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const fetchProjectValues = async () => {
      try {
        const { data, error } = await supabase
          .from("projetos_config")
          .select("id, metadata")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (!isActive || !data?.length) return;

        const remoteValueObjects = {};
        const remoteValueAmounts = {};
        data.forEach((row) => {
          if (!row?.id) return;
          const metadata = row.metadata ?? {};
          const valueObject = normalizeProjectValueObject(metadata.projectValue);
          remoteValueObjects[row.id] = valueObject;
          remoteValueAmounts[row.id] = normalizeProjectValueToBRL(valueObject);
        });

        if (Object.keys(remoteValueAmounts).length === 0) return;

        setProjectPrices((current) => ({ ...current, ...remoteValueAmounts }));

        if (typeof window !== "undefined") {
          try {
            const stored = window.localStorage.getItem(PROJECT_VALUES_STORAGE_KEY);
            const base = stored ? JSON.parse(stored) || {} : {};
            const merged = {
              ...(base && typeof base === "object" ? base : {}),
              ...remoteValueObjects,
            };
            window.localStorage.setItem(
              PROJECT_VALUES_STORAGE_KEY,
              JSON.stringify(merged),
            );
          } catch (storageErr) {
            console.error("Não foi possível atualizar valores de projetos localmente", storageErr);
          }
        }
      } catch (err) {
        console.error("Não foi possível carregar valores de projetos no Supabase", err);
      }
    };

    fetchProjectValues();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStorage = (event) => {
      if (event.key === PROJECT_VALUES_STORAGE_KEY) {
        try {
          const next = event.newValue ? JSON.parse(event.newValue) : {};
          if (next && typeof next === "object") {
            const normalized = Object.entries(next).reduce((acc, [projectId, value]) => {
              acc[projectId] = normalizeProjectValueToBRL(value);
              return acc;
            }, {});
            setProjectPrices(normalized);
          }
        } catch (err) {
          console.error("Não foi possível atualizar valores de projetos", err);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("public:projetos_config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projetos_config" },
        (payload) => {
          const record = payload.new ?? payload.old;
          if (!record?.id) return;

          if (payload.eventType === "DELETE") {
            setProjectPrices((current) => {
              if (!(record.id in current)) return current;
              const next = { ...current };
              delete next[record.id];
              if (typeof window !== "undefined") {
                try {
                  const stored = window.localStorage.getItem(PROJECT_VALUES_STORAGE_KEY);
                  const base = stored ? JSON.parse(stored) || {} : {};
                  if (record.id in base) {
                    delete base[record.id];
                    window.localStorage.setItem(
                      PROJECT_VALUES_STORAGE_KEY,
                      JSON.stringify(base),
                    );
                  }
                } catch (storageErr) {
                  console.error(
                    "Não foi possível remover valor de projeto localmente",
                    storageErr,
                  );
                }
              }
              return next;
            });
            return;
          }

          const metadata =
            payload.new?.metadata && typeof payload.new.metadata === "object"
              ? payload.new.metadata
              : {};
          const valueObject = normalizeProjectValueObject(metadata.projectValue);
          const value = normalizeProjectValueToBRL(valueObject);

          setProjectPrices((current) => {
            if (current[record.id] === value) return current;
            const next = { ...current, [record.id]: value };
            if (typeof window !== "undefined") {
              try {
                const stored = window.localStorage.getItem(PROJECT_VALUES_STORAGE_KEY);
                const base = stored ? JSON.parse(stored) || {} : {};
                base[record.id] = valueObject;
                window.localStorage.setItem(PROJECT_VALUES_STORAGE_KEY, JSON.stringify(base));
              } catch (storageErr) {
                console.error(
                  "Não foi possível sincronizar valores de projetos localmente",
                  storageErr,
                );
              }
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [contactsResponse, assignmentsResponse, ordersResponse] = await Promise.all([
          supabase.from("contatos").select("*").order("nome", { ascending: true }),
          supabase.from("contato_projetos").select("*")
        ]);

        if (contactsResponse.error) throw contactsResponse.error;
        if (assignmentsResponse.error) throw assignmentsResponse.error;

        const assignments = (assignmentsResponse.data ?? []).reduce((acc, item) => {
          if (!acc[item.contato_id]) acc[item.contato_id] = [];
          acc[item.contato_id].push(item.projeto_id);
          return acc;
        }, {});

        const enrichedContacts = (contactsResponse.data ?? []).map((contact) => ({
          ...contact,
          projectIds: assignments[contact.id] ?? [],
          displayName:
            typeof contact.empresa === "string" && contact.empresa.trim()
              ? contact.empresa.trim()
              : contact.nome,
        }));
        setContacts(enrichedContacts);

        const { data: ordersData, error: ordersError } = await supabase
          .from("pedidos")
          .select("*")
          .order("created_at", { ascending: false });
        if (ordersError) throw ordersError;
        setOrders(ordersData ?? []);
      } catch (err) {
        console.error("Erro ao carregar pedidos", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const availableProjects = useMemo(() => {
    if (!selectedContact) return catalogProjects;
    if (!selectedContact.projectIds || selectedContact.projectIds.length === 0)
      return catalogProjects;
    return catalogProjects.filter((project) =>
      selectedContact.projectIds.includes(project.id),
    );
  }, [selectedContact, catalogProjects]);

  const linkedProjects = useMemo(() => {
    if (!selectedContact || !selectedContact.projectIds?.length) return [];
    return catalogProjects.filter((project) =>
      selectedContact.projectIds.includes(project.id),
    );
  }, [selectedContact, catalogProjects]);

  const getProjectUnitPrice = (projectId) => {
    if (!projectId) return 0;
    const storedValue = projectPrices?.[projectId];
    const storedNumber = Number(storedValue);
    if (Number.isFinite(storedNumber) && storedNumber > 0) return storedNumber;
    const definition = catalogProjects.find((project) => project.id === projectId);
    const fallbackNumber = Number(definition?.defaultValue);
    return Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : 0;
  };

  const selectedProject = useMemo(() => {
    if (!form.projetoId) return null;
    return (
      availableProjects.find((project) => project.id === form.projetoId) ??
      catalogProjects.find((project) => project.id === form.projetoId) ??
      null
    );
  }, [availableProjects, catalogProjects, form.projetoId]);

  const projectOptions = useMemo(() => {
    if (!form.projetoId) return availableProjects;
    if (availableProjects.some((project) => project.id === form.projetoId)) return availableProjects;
    const fallback = catalogProjects.find((project) => project.id === form.projetoId);
    return fallback ? [...availableProjects, fallback] : availableProjects;
  }, [availableProjects, catalogProjects, form.projetoId]);

  const normalizeDecimal = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      const normalized = trimmed.includes(",")
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed;
      const result = Number.parseFloat(normalized);
      return Number.isFinite(result) ? result : 0;
    }
    return 0;
  };

  const unitPrice = selectedProject ? getProjectUnitPrice(selectedProject.id) : 0;
  const quantityNumber = Number(form.quantidade) || 0;
  const basePrice = Number.isFinite(unitPrice * quantityNumber)
    ? Number((unitPrice * quantityNumber).toFixed(2))
    : 0;
  const adjustmentNumber = normalizeDecimal(form.ajusteValor);
  const finalPrice = Number.isFinite(basePrice + adjustmentNumber)
    ? Number((basePrice + adjustmentNumber).toFixed(2))
    : basePrice;

  useEffect(() => {
    if (!availableProjects.length) return;
    if (editingId) return;
    if (!availableProjects.find((project) => project.id === form.projetoId)) {
      setForm((prev) => ({ ...prev, projetoId: availableProjects[0].id }));
    }
  }, [availableProjects, form.projetoId, editingId]);

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const normalized = search.toLowerCase();
    return orders.filter((entry) => {
      const phaseLabel =
        ORDER_PHASE_LOOKUP[entry.fase]?.label ?? ORDER_PHASE_LOOKUP[DEFAULT_ORDER_PHASE].label;
      const contact = contactMap[entry.contato_id];
      const companyName =
        typeof contact?.empresa === "string" && contact.empresa.trim()
          ? contact.empresa.trim()
          : null;
      const contactPerson =
        typeof contact?.nome === "string" && contact.nome.trim() ? contact.nome.trim() : null;
      return [
        entry.nfe,
        companyName,
        contactPerson,
        entry.contato_nome,
        entry.placa_codigo,
        entry.projeto_nome,
        entry.data_pedido,
        entry.data_entrega,
        entry.observacoes,
        entry.nfe_url,
        phaseLabel,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalized));
    });
  }, [orders, search, contacts]);

  const clearSelectedNfeFile = () => {
    setNfeFile(null);
    setFileInputKey(Date.now());
  };

  const resetNfeControls = () => {
    clearSelectedNfeFile();
    setRemoveExistingNfe(false);
  };

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    if (field === "contatoId") {
      setForm((prev) => ({ ...prev, contatoId: value, projetoId: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNfeFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      clearSelectedNfeFile();
      setRemoveExistingNfe(false);
      return;
    }

    if (file.size > MAX_NFE_SIZE) {
      alert("O arquivo da NFE excede o limite de 5MB.");
      event.target.value = "";
      clearSelectedNfeFile();
      setRemoveExistingNfe(false);
      return;
    }

    if (file.type && !ACCEPTED_NFE_TYPES.includes(file.type)) {
      alert("Envie apenas arquivos PDF ou XML da nota fiscal.");
      event.target.value = "";
      clearSelectedNfeFile();
      setRemoveExistingNfe(false);
      return;
    }

    setNfeFile(file);
    setRemoveExistingNfe(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.nfe.trim() || !form.contatoId) {
      alert("Informe o número do pedido e selecione o cliente.");
      return;
    }

    const trimmedNfe = form.nfe.trim();
    if (!/^\d+$/.test(trimmedNfe)) {
      alert("O número do pedido deve conter apenas números sequenciais.");
      return;
    }

    const nfeNumber = Number.parseInt(trimmedNfe, 10);
    if (!Number.isFinite(nfeNumber)) {
      alert("Número de pedido inválido.");
      return;
    }

    if (!editingId && nfeNumber !== nextNfeNumber) {
      alert(`O próximo número de pedido disponível é ${nextNfeNumber}.`);
      return;
    }

    const contact = selectedContact;
    const project =
      availableProjects.find((item) => item.id === form.projetoId) ??
      catalogProjects.find((item) => item.id === form.projetoId) ??
      availableProjects[0];

    if (!project) {
      alert("Associe pelo menos uma placa ao cliente antes de registrar o pedido.");
      return;
    }

    const contactIdForReset = form.contatoId;
    const previousNfePath = form.nfeUrl || null;
    let currentNfePath = previousNfePath;
    const pathsToRemove = [];

    try {
      setSaving(true);
      setError(null);

      if (nfeFile) {
        const extension = (() => {
          const raw = nfeFile.name.split(".").pop();
          if (!raw) return "pdf";
          return raw.toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
        })();
        const storagePath = `pedidos/${trimmedNfe}-${Date.now()}.${extension}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(NFE_BUCKET)
          .upload(storagePath, nfeFile, {
            cacheControl: "3600",
            upsert: true,
            contentType: nfeFile.type || undefined,
          });
        if (uploadError) throw uploadError;
        currentNfePath = uploadData?.path ?? storagePath;

        if (previousNfePath && previousNfePath !== currentNfePath) {
          pathsToRemove.push(previousNfePath);
        }
      } else if (removeExistingNfe && previousNfePath) {
        pathsToRemove.push(previousNfePath);
        currentNfePath = null;
      } else if (removeExistingNfe) {
        currentNfePath = null;
      }

      const displayContactName =
        typeof contact?.empresa === "string" && contact.empresa.trim()
          ? contact.empresa.trim()
          : contact?.nome ?? "";

      const payload = {
        nfe: trimmedNfe,
        contato_id: form.contatoId,
        contato_nome: displayContactName,
        quantidade: Number(form.quantidade) || 0,
        projeto_id: project.id,
        projeto_nome: project.name,
        placa_codigo: project.finishedBoardCode,
        data_pedido: formatIsoDate(form.dataPedido),
        data_entrega: formatIsoDate(form.dataEntrega),
        valor_base: basePrice,
        ajuste_valor: adjustmentNumber,
        valor: finalPrice,
        observacoes: form.observacoes?.trim() || null,
        nfe_url: currentNfePath,
        fase: form.fase || DEFAULT_ORDER_PHASE,
      };

      if (editingId) {
        const { data, error: updateError } = await supabase
          .from("pedidos")
          .update(payload)
          .eq("id", editingId)
          .select("*")
          .single();
        if (updateError) throw updateError;
        setOrders((current) => current.map((entry) => (entry.id === editingId ? data : entry)));
        setEditingId(null);
        setForm({
          ...initialForm,
          contatoId: data?.contato_id ?? contactIdForReset ?? "",
        });
      } else {
        const { data, error: insertError } = await supabase
          .from("pedidos")
          .insert(payload)
          .select("*")
          .single();
        if (insertError) throw insertError;
        setOrders((current) => [data, ...current]);
        setForm({ ...initialForm, contatoId: contactIdForReset ?? "" });
      }

      if (pathsToRemove.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(NFE_BUCKET)
          .remove(pathsToRemove);
        if (removeError) {
          console.warn("Não foi possível remover arquivos antigos de NFE:", removeError);
        }
      }
      resetNfeControls();
    } catch (err) {
      console.error("Erro ao salvar pedido", err);
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    resetNfeControls();
    setForm({
      nfe: entry.nfe ?? "",
      contatoId: entry.contato_id ?? "",
      quantidade:
        entry.quantidade !== null && entry.quantidade !== undefined
          ? String(entry.quantidade)
          : "",
      projetoId: entry.projeto_id ?? "",
      dataPedido: formatIsoDate(entry.data_pedido) || "",
      dataEntrega: formatIsoDate(entry.data_entrega) || "",
      ajusteValor:
        entry.ajuste_valor !== null &&
        entry.ajuste_valor !== undefined &&
        Number(entry.ajuste_valor) !== 0
          ? String(entry.ajuste_valor)
          : "",
      observacoes: entry.observacoes ?? "",
      nfeUrl: entry.nfe_url ?? "",
      fase: entry.fase ?? DEFAULT_ORDER_PHASE,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    resetNfeControls();
    setForm((prev) => ({ ...initialForm, contatoId: prev.contatoId ?? "" }));
  };

  const handleDelete = async (entry) => {
    const label = entry.nfe ? `Remover o pedido ${entry.nfe}?` : "Remover este pedido?";
    if (!confirm(label)) return;
    try {
      const { error: deleteError } = await supabase.from("pedidos").delete().eq("id", entry.id);
      if (deleteError) throw deleteError;
      setOrders((current) => current.filter((item) => item.id !== entry.id));

      if (entry.nfe_url) {
        const { error: removeError } = await supabase.storage
          .from(NFE_BUCKET)
          .remove([entry.nfe_url]);
        if (removeError) {
          console.warn("Não foi possível remover a NFE associada:", removeError);
        }
      }

      if (editingId === entry.id) {
        setEditingId(null);
        resetNfeControls();
        setForm((prev) => ({ ...initialForm, contatoId: prev.contatoId ?? "" }));
      }
    } catch (err) {
      console.error("Erro ao excluir pedido", err);
      alert("Não foi possível excluir o pedido.");
    }
  };

  const handlePhaseUpdate = async (entryId, nextPhase) => {
    if (!entryId || !nextPhase) return;
    const normalizedPhase =
      ORDER_PHASE_LOOKUP[nextPhase]?.value ?? (ORDER_PHASE_LOOKUP[nextPhase] ? nextPhase : null);
    if (!normalizedPhase || !ORDER_PHASE_LOOKUP[normalizedPhase]) return;

    const currentEntry = orders.find((item) => item.id === entryId);
    const currentPhaseValue =
      ORDER_PHASE_LOOKUP[currentEntry?.fase]?.value ?? currentEntry?.fase ?? DEFAULT_ORDER_PHASE;
    if (currentPhaseValue === normalizedPhase) return;

    try {
      setPhaseUpdatingId(entryId);
      const { data, error } = await supabase
        .from("pedidos")
        .update({ fase: normalizedPhase })
        .eq("id", entryId)
        .select("*")
        .single();
      if (error) throw error;
      setOrders((currentList) =>
        currentList.map((item) => (item.id === entryId ? data : item)),
      );
      if (editingId === entryId) {
        setForm((prev) => ({ ...prev, fase: normalizedPhase }));
      }
    } catch (err) {
      console.error("Erro ao atualizar fase do pedido", err);
      alert("Não foi possível atualizar a fase do pedido.");
    } finally {
      setPhaseUpdatingId(null);
    }
  };

  const handleDownloadNfe = async (path, id) => {
    if (!path) return;
    try {
      setDownloadingId(id ?? path);
      const { data, error } = await supabase.storage
        .from(NFE_BUCKET)
        .createSignedUrl(path, 60);
      if (error) throw error;
      const url = data?.signedUrl;
      if (url && typeof window !== "undefined") {
        window.open(url, "_blank", "noopener");
      }
    } catch (err) {
      console.error("Erro ao baixar NFE", err);
      alert("Não foi possível baixar a nota fiscal.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <WltLogoMark className="h-10 w-auto" title="Logo WLT" />
          <h1 className="text-xl font-semibold text-slate-800">Pedidos</h1>
        </div>
        <p className="text-sm text-slate-500">
          Registre as placas vendidas para cada cliente e acompanhe as datas de entrega e faturamento.
        </p>

        {editingId && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Editando o pedido <span className="font-semibold">#{form.nfe || "sem número"}</span>.
            Atualize os dados abaixo e salve para aplicar as alterações.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Pedido
            <input
              type="text"
              value={form.nfe}
              onChange={handleFieldChange("nfe")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Ex: 000123"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Cliente
            <select
              value={form.contatoId}
              onChange={handleFieldChange("contatoId")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">Selecione um cliente</option>
              {clientContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {(() => {
                    const companyLabel = contact.displayName ?? contact.nome;
                    if (
                      contact.nome &&
                      companyLabel &&
                      contact.nome.trim().toLowerCase() !== companyLabel.trim().toLowerCase()
                    ) {
                      return `${companyLabel} — ${contact.nome}`;
                    }
                    return companyLabel;
                  })()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Placa / Projeto
            <select
              value={form.projetoId}
              onChange={handleFieldChange("projetoId")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {projectOptions.length === 0 && <option value="">Nenhuma placa disponível</option>}
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.finishedBoardCode} - {project.name}
                </option>
              ))}
            </select>
          </label>
          {selectedContact && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 md:col-span-2 lg:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Placas vinculadas a{" "}
                {selectedContact.displayName ?? selectedContact.empresa ?? selectedContact.nome}
              </p>
              {selectedContact.displayName &&
                selectedContact.nome &&
                selectedContact.displayName.toLowerCase() !== selectedContact.nome.toLowerCase() && (
                  <p className="mt-1 text-xs text-slate-500">
                    Responsável: <span className="font-medium text-slate-600">{selectedContact.nome}</span>
                  </p>
                )}
              {linkedProjects.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {linkedProjects.map((project) => (
                  <li
                    key={project.id}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm"
                  >
                    <span className="font-semibold text-slate-700">
                      {project.finishedBoardCode}
                    </span>
                    <span className="ml-2 text-slate-500">{project.name}</span>
                    <span className="ml-2 text-slate-400">
                      {maskValue(formatCurrency(getProjectUnitPrice(project.id)))}
                    </span>
                  </li>
                ))}
              </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Nenhuma placa foi vinculada a este cliente. Todas as opcoes cadastradas estao
                  disponiveis na lista acima.
                </p>
              )}
            </div>
          )}
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Quantidade
            <input
              type="number"
              min="0"
              step="1"
              value={form.quantidade}
              onChange={handleFieldChange("quantidade")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Data do pedido
            <input
              type="date"
              value={form.dataPedido}
              onChange={handleFieldChange("dataPedido")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Data para entrega
            <input
              type="date"
              value={form.dataEntrega}
              onChange={handleFieldChange("dataEntrega")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Valor unitario (R$)
            <input
              type="text"
              value={maskValue(formatCurrency(unitPrice))}
              readOnly
              className="mt-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-right font-semibold text-slate-700 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Fase do pedido
            <select
              value={form.fase}
              onChange={handleFieldChange("fase")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {ORDER_PHASES.map((phase) => (
                <option key={phase.value} value={phase.value}>
                  {phase.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Valor base (R$)
            <input
              type="text"
              value={maskValue(formatCurrency(basePrice))}
              readOnly
              className="mt-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-right font-semibold text-slate-700 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Ajuste adicional / Desconto (R$)
            <input
              type="text"
              inputMode="decimal"
              value={form.ajusteValor}
              onChange={handleFieldChange("ajusteValor")}
              placeholder="Ex: 150 ou -75"
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Valor final (R$)
            <input
              type="text"
              value={maskValue(formatCurrency(finalPrice))}
              readOnly
              className="mt-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-right font-semibold text-slate-700 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2 lg:col-span-3">
            Nota fiscal (PDF ou XML)
            <input
              key={fileInputKey}
              type="file"
              accept=".pdf,.xml"
              onChange={handleNfeFileChange}
              disabled={saving}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-700"
            />
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              {nfeFile ? (
                <>
                  <p>
                    Arquivo selecionado:{" "}
                    <span className="font-medium text-slate-600">{nfeFile.name}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      clearSelectedNfeFile();
                      setRemoveExistingNfe(false);
                    }}
                    className="text-left font-medium text-rose-600 hover:underline"
                  >
                    Limpar arquivo selecionado
                  </button>
                </>
              ) : form.nfeUrl && !removeExistingNfe ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleDownloadNfe(form.nfeUrl, "form-download")}
                    disabled={downloadingId === "form-download"}
                    className="text-left font-medium text-sky-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {downloadingId === "form-download" ? "Gerando link..." : "Baixar arquivo atual"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingNfe(true)}
                    className="text-left font-medium text-rose-600 hover:underline"
                  >
                    Remover arquivo atual
                  </button>
                </>
              ) : form.nfeUrl && removeExistingNfe ? (
                <>
                  <p className="font-medium text-rose-600">
                    O arquivo atual sera removido ao salvar.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingNfe(false)}
                    className="text-left font-medium text-sky-600 hover:underline"
                  >
                    Desfazer remoção
                  </button>
                </>
              ) : (
                <p>Opcional: anexe a NFE em PDF ou XML para manter o histórico.</p>
              )}
            </div>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2 lg:col-span-3">
            Observações
            <textarea
              value={form.observacoes}
              onChange={handleFieldChange("observacoes")}
              rows={3}
              placeholder="Anote combinações especiais, acordos ou detalhes relevantes."
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <div className="flex items-end gap-3 md:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Atualizar pedido" : "Registrar pedido"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Pedidos cadastrados</h2>
            <p className="text-sm text-slate-500">
              Pesquise por pedido, cliente ou placa para localizar registros.
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por pedido, cliente, placa..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-72"
          />
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Carregando pedidos...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Nenhum pedido encontrado.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Pedido</th>
                  <th className="px-4 py-2 text-left">Cliente</th>
                  <th className="px-4 py-2 text-left">Placa</th>
                  <th className="px-4 py-2 text-right">Quantidade</th>
                  <th className="px-4 py-2 text-right">Valor base</th>
                  <th className="px-4 py-2 text-right">Ajuste</th>
                  <th className="px-4 py-2 text-right">Valor final</th>
                  <th className="px-4 py-2 text-left">Fase</th>
                  <th className="px-4 py-2 text-left">Pedido em</th>
                  <th className="px-4 py-2 text-left">Entrega</th>
                  <th className="px-4 py-2 text-left">Criado em</th>
                  <th className="px-4 py-2 text-left">NFE</th>
                  <th className="px-4 py-2 text-left">Observações</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrders.map((entry) => {
                  const baseValue =
                    entry.valor_base !== null && entry.valor_base !== undefined
                      ? Number(entry.valor_base)
                      : entry.valor !== null && entry.valor !== undefined
                      ? Number(entry.valor) - (Number(entry.ajuste_valor) || 0)
                      : 0;
                  const adjustmentValue =
                    entry.ajuste_valor !== null && entry.ajuste_valor !== undefined
                      ? Number(entry.ajuste_valor)
                      : 0;
                  const finalValue =
                    entry.valor !== null && entry.valor !== undefined
                      ? Number(entry.valor)
                      : baseValue + adjustmentValue;
                  const normalizedPhaseValue =
                    ORDER_PHASE_LOOKUP[entry.fase]?.value ??
                    entry.fase ??
                    DEFAULT_ORDER_PHASE;
                  const phaseMeta =
                    ORDER_PHASE_LOOKUP[normalizedPhaseValue] ??
                    ORDER_PHASE_LOOKUP[DEFAULT_ORDER_PHASE];
                  const phaseSelectValue =
                    phaseMeta.value ?? normalizedPhaseValue ?? DEFAULT_ORDER_PHASE;
                  const contactInfo = contactMap[entry.contato_id];
                  const companyName =
                    typeof contactInfo?.empresa === "string" && contactInfo.empresa.trim()
                      ? contactInfo.empresa.trim()
                      : null;
                  const contactPerson =
                    typeof contactInfo?.nome === "string" && contactInfo.nome.trim()
                      ? contactInfo.nome.trim()
                      : null;
                  const displayCompany = companyName || entry.contato_nome || "-";

                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{entry.nfe}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <p className="font-semibold text-slate-700">{displayCompany}</p>
                        {contactPerson &&
                          (!companyName ||
                            contactPerson.toLowerCase() !== companyName.toLowerCase()) && (
                            <p className="text-xs text-slate-500">Contato: {contactPerson}</p>
                          )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-700">{entry.projeto_nome || "-"}</p>
                          <p className="text-xs text-slate-400">{entry.placa_codigo || "-"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {Number(entry.quantidade ?? 0).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {maskValue(formatCurrency(baseValue))}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          adjustmentValue > 0
                            ? "text-emerald-600"
                            : adjustmentValue < 0
                            ? "text-rose-600"
                            : "text-slate-500"
                        }`}
                      >
                        {adjustmentValue === 0 ? "-" : maskValue(formatCurrency(adjustmentValue))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {maskValue(formatCurrency(finalValue))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <label htmlFor={`order-phase-${entry.id}`} className="sr-only">
                          Atualizar fase do pedido
                        </label>
                        <select
                          id={`order-phase-${entry.id}`}
                          value={phaseSelectValue}
                          onChange={(event) => handlePhaseUpdate(entry.id, event.target.value)}
                          disabled={phaseUpdatingId === entry.id}
                          title={
                            phaseUpdatingId === entry.id
                              ? "Atualizando fase..."
                              : "Alterar fase do pedido"
                          }
                          className={`cursor-pointer rounded-full border border-transparent px-3 py-1 text-xs font-semibold transition ${phaseMeta.badgeClass} focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          {ORDER_PHASES.map((phase) => (
                            <option key={phase.value} value={phase.value}>
                              {phase.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateDisplay(entry.data_pedido)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateDisplay(entry.data_entrega)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleString("pt-BR")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {entry.nfe_url ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadNfe(entry.nfe_url, entry.id)}
                            disabled={downloadingId === entry.id}
                            className="text-sm font-medium text-sky-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {downloadingId === entry.id ? "Gerando link..." : "Baixar NFE"}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {entry.observacoes ? (
                          <p className="max-w-xs whitespace-pre-wrap break-words text-slate-600">
                            {entry.observacoes}
                          </p>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="text-sm font-medium text-sky-600 hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry)}
                            className="text-sm font-medium text-rose-600 hover:underline"
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}




