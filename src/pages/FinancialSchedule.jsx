import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import WltLogoMark from "../components/WltLogoMark";

const buildParcelArray = (count) =>
  Array.from({ length: count }, (_, index) => ({
    offsetDays: index === 0 ? 0 : index * 30,
    valor: "",
    customDate: null,
  }));

const initialForm = {
  type: "receber",
  contatoId: "",
  descricao: "",
  valor: "",
  formaPagamento: "",
  dataEmissao: "",
  numeroParcelas: 1,
  parcelas: buildParcelArray(1),
  adiantamentoValor: "",
  adiantamentoData: "",
  status: "pendente",
  observacoes: "",
};

const TYPE_OPTIONS = [
  { value: "receber", label: "Receber" },
  { value: "pagar", label: "Pagar" },
];

const IMPOSTO_CONTACT_OPTION = { value: "__imposto__", label: "Imposto" };

const STATUS_BY_TYPE = {
  receber: [
    { value: "pendente", label: "Pendente" },
    { value: "recebido", label: "Recebido" },
    { value: "cancelado", label: "Cancelado" },
  ],
  pagar: [
    { value: "pendente", label: "Pendente" },
    { value: "pago", label: "Pago" },
    { value: "cancelado", label: "Cancelado" },
  ],
};

const getTypeActionLabel = (tipo) => {
  if (tipo === "receber") return "Receber de";
  return "Pagar para";
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const isCompletedStatus = (status) => {
  const normalized = (status || "").toLowerCase();
  return normalized === "pago" || normalized === "recebido" || normalized === "cancelado";
};

const sortEntries = (list) => {
  const copy = list.slice();
  copy.sort((a, b) => {
    const weightA = isCompletedStatus(a.status) ? 1 : 0;
    const weightB = isCompletedStatus(b.status) ? 1 : 0;
    if (weightA !== weightB) {
      return weightA - weightB;
    }

    const dateA = parseDate(a.data_prevista);
    const dateB = parseDate(b.data_prevista);
    if (dateA && dateB) {
      const comparison = dateA.getTime() - dateB.getTime();
      if (comparison !== 0) return weightA === 1 ? -comparison : comparison;
    } else if (dateA && !dateB) {
      return -1;
    } else if (!dateA && dateB) {
      return 1;
    }

    const createdA = parseDate(a.created_at);
    const createdB = parseDate(b.created_at);
    if (createdA && createdB) {
      const comparison = createdB.getTime() - createdA.getTime();
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
  return copy;
};

const getStatusOptions = (type) => STATUS_BY_TYPE[type] ?? STATUS_BY_TYPE.pagar;

const addDays = (baseDate, amount) => {
  if (!baseDate) return null;
  const base = parseDate(baseDate);
  if (!base) return null;
  const result = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  result.setDate(result.getDate() + Number(amount || 0));
  return result;
};

const formatIsoDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "-";
};

const generateGroupId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pg-${Math.random().toString(36).slice(2, 11)}`;
};

const distributeValues = (total, count) => {
  if (!Number.isFinite(total) || total <= 0 || count <= 0) {
    return Array.from({ length: count }, () => 0);
  }
  const average = total / count;
  return Array.from({ length: count }, (_, index) =>
    Number(
      (index === count - 1
        ? total - average * (count - 1)
        : average
      ).toFixed(2),
    ),
  );
};

export default function FinancialSchedule() {
  const [form, setForm] = useState(initialForm);
  const [entries, setEntries] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);

  const contactMap = useMemo(() => {
    return contacts.reduce((acc, contact) => {
      acc[contact.id] = contact;
      return acc;
    }, {});
  }, [contacts]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [
          { data: contactRows, error: contactsError },
          { data: agendaRows, error: agendaError },
        ] = await Promise.all([
          supabase.from("contatos").select("*").order("nome", { ascending: true }),
          supabase.from("agenda_financeira").select("*").order("data_prevista", { ascending: true }),
        ]);

        if (contactsError) throw contactsError;
        if (agendaError) throw agendaError;

        setContacts(contactRows ?? []);
        setEntries(sortEntries(agendaRows ?? []));
        setError(null);
      } catch (err) {
        console.error("Erro ao carregar agenda financeira", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("contatos_agenda_financeira")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contatos" },
        async () => {
          try {
            const { data, error } = await supabase
              .from("contatos")
              .select("*")
              .order("nome", { ascending: true });
            if (error) throw error;
            setContacts(data ?? []);
          } catch (err) {
            console.error("Erro ao atualizar contatos", err);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    if (field === "type") {
      setForm((prev) => ({
        ...prev,
        type: value,
        status: "pendente",
        parcelas: prev.parcelas.map((parcela) => {
          const offsetValue = Number(parcela.offsetDays) || 0;
          const defaultDate = addDays(prev.dataEmissao, offsetValue);
          return {
            ...parcela,
            customDate:
              value === "pagar"
                ? parcela.customDate ??
                  (defaultDate ? formatIsoDate(defaultDate) : formatIsoDate(prev.dataEmissao))
                : null,
          };
        }),
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resolveEntryNames = (entry) => {
    if (!entry) {
      return {
        displayContact: "Contato sem nome",
        displayCompany: null,
      };
    }
    const contact =
      entry.contato_id !== null && entry.contato_id !== undefined
        ? contactMap[entry.contato_id]
        : null;
    const trimmed = (value) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    const isImpostoEntry =
      entry.contato_id === null || entry.contato_nome === IMPOSTO_CONTACT_OPTION.label;

    const companyFromContact = contact ? trimmed(contact.empresa) : null;
    const nameFromContact = contact ? trimmed(contact.nome) : null;
    const nameFromEntry = trimmed(entry.contato_nome);

    const displayCompany = isImpostoEntry
      ? IMPOSTO_CONTACT_OPTION.label
      : companyFromContact || nameFromEntry || nameFromContact || null;
    const displayContact = nameFromContact || nameFromEntry || displayCompany || "Contato sem nome";

    return { displayContact, displayCompany };
  };

  const handleParcelCountChange = (event) => {
    const nextCount = Math.max(1, Number(event.target.value) || 1);
    setForm((prev) => {
      const limited = prev.parcelas.slice(0, nextCount).map((parcela) => ({
        offsetDays: parcela.offsetDays ?? 0,
        valor: parcela.valor ?? "",
        customDate: parcela.customDate ?? null,
      }));
      while (limited.length < nextCount) {
        const last = limited[limited.length - 1];
        const nextOffset =
          last && Number.isFinite(Number(last.offsetDays))
            ? Number(last.offsetDays) + 30
            : limited.length === 0
            ? 0
            : limited.length * 30;
        const defaultDate =
          prev.type === "pagar"
            ? addDays(prev.dataEmissao, nextOffset)
            : null;
        limited.push({
          offsetDays: nextOffset,
          valor: "",
          customDate:
            prev.type === "pagar"
              ? defaultDate
                ? formatIsoDate(defaultDate)
                : formatIsoDate(prev.dataEmissao)
              : null,
        });
      }
      const normalized = limited.map((parcela) => {
        const offsetValue = Number(parcela.offsetDays) || 0;
        const defaultDate = addDays(prev.dataEmissao, offsetValue);
        return {
          ...parcela,
          customDate:
            prev.type === "pagar"
              ? parcela.customDate ??
                (defaultDate ? formatIsoDate(defaultDate) : formatIsoDate(prev.dataEmissao))
              : null,
        };
      });
      return {
        ...prev,
        numeroParcelas: nextCount,
        parcelas: normalized,
      };
    });
  };

  const handleParcelaFieldChange = (index, field) => (event) => {
    const value = event.target.value;
    setForm((prev) => {
      const next = prev.parcelas.map((parcela, parcelIndex) => {
        if (parcelIndex !== index) return parcela;
        if (field === "offsetDays") {
          const numeric = Number(value);
          return {
            ...parcela,
            offsetDays: Number.isFinite(numeric) ? numeric : 0,
          };
        }
        if (field === "valor") {
          return { ...parcela, valor: value };
        }
        if (field === "customDate") {
          return { ...parcela, customDate: value || null };
        }
        return parcela;
      });
      return { ...prev, parcelas: next };
    });
  };

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const normalized = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const { displayContact, displayCompany } = resolveEntryNames(entry);
      return [
        displayContact,
        displayCompany,
        entry.contato_nome,
        entry.descricao,
        entry.observacoes,
        entry.tipo,
        entry.status,
        entry.forma_pagamento,
        entry.parcela_numero ? `parcela ${entry.parcela_numero}` : null,
        entry.parcelas_total ? `${entry.parcelas_total} parcelas` : null,
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(normalized));
    });
  }, [entries, search, contactMap]);

  const upcomingHighlight = useMemo(() => {
    const today = startOfToday();
    const pendingStatuses = new Set(["pendente", "pago", "recebido", "confirmado"]);
    return entries
      .filter((entry) => {
        if (!entry.data_prevista) return false;
        if (!pendingStatuses.has(entry.status ?? "pendente")) return false;
        const dueDate = parseDate(entry.data_prevista);
        if (!dueDate) return false;
        return dueDate.getTime() >= today.getTime();
      })
      .sort((a, b) => {
        const dateA = parseDate(a.data_prevista);
        const dateB = parseDate(b.data_prevista);
        return dateA.getTime() - dateB.getTime();
      })[0];
  }, [entries]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.contatoId) {
      alert("Selecione um cliente ou fornecedor.");
      return;
    }
    if (!form.dataEmissao) {
      alert("Informe a data de emissao da NFE.");
      return;
    }

    const isImpostoSelection = form.contatoId === IMPOSTO_CONTACT_OPTION.value;
    const contact =
      !isImpostoSelection && form.contatoId ? contactMap[form.contatoId] : null;
    const contactIdForPayload = isImpostoSelection ? null : form.contatoId;
    const totalParcelas = Math.max(1, Number(form.numeroParcelas) || 1);

    if (editingId && totalParcelas !== 1) {
      alert("A edicao de um compromisso suporta apenas uma parcela por vez.");
      return;
    }

    const emissionDate = parseDate(form.dataEmissao);
    const emissionFallback = emissionDate ?? startOfToday();
    const parcelas = form.parcelas.slice(0, totalParcelas);
    const manualValues = parcelas.map((parcela) => {
      const parsed = Number(parcela.valor);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });
    const totalValor = Number(form.valor);
    const contactNameForPayload = isImpostoSelection
      ? IMPOSTO_CONTACT_OPTION.label
      : contact?.nome ?? editingEntry?.contato_nome ?? "";
    const parcelValues = manualValues.some((value) => value !== null)
      ? manualValues.map((value) => value ?? 0)
      : distributeValues(Number.isFinite(totalValor) ? totalValor : 0, totalParcelas);
    const isPayingType = form.type === "pagar";

    const groupId =
      editingId && editingEntry?.grupo_id ? editingEntry.grupo_id : generateGroupId();
    const adiantamentoValor = form.adiantamentoValor
      ? Number(form.adiantamentoValor)
      : null;
    const payloads = parcelas.map((parcela, index) => {
      const offsetValue = Number(parcela.offsetDays) || 0;
      const parsedCustomDate =
        parcela.customDate && parcela.customDate.trim()
          ? parseDate(parcela.customDate.trim())
          : null;
      const dueDateValue = isPayingType
        ? parsedCustomDate ?? emissionFallback
        : addDays(form.dataEmissao, offsetValue) ?? emissionFallback;
      const diasAposEmissao =
        emissionDate && dueDateValue
          ? Math.max(
              0,
              Math.round(
                (dueDateValue.getTime() - emissionDate.getTime()) / (1000 * 60 * 60 * 24),
              ),
            )
          : 0;
      return {
        tipo: form.type,
        contato_id: contactIdForPayload,
        contato_nome: contactNameForPayload,
        descricao: form.descricao.trim(),
        observacoes: form.observacoes.trim() || null,
        valor: parcelValues[index],
        valor_parcela: parcelValues[index],
        data_prevista: formatIsoDate(dueDateValue),
        status: form.status,
        forma_pagamento: form.formaPagamento.trim() || null,
        parcelas_total: editingId
          ? editingEntry?.parcelas_total ?? totalParcelas
          : totalParcelas,
        parcela_numero: editingId
          ? editingEntry?.parcela_numero ?? index + 1
          : index + 1,
        data_emissao: form.dataEmissao,
        dias_apos_emissao: diasAposEmissao,
        grupo_id: groupId,
        adiantamento_valor: adiantamentoValor,
        adiantamento_data: form.adiantamentoData || null,
      };
    });

    if (payloads.some((item) => !item.data_prevista)) {
      alert("Verifique as datas das parcelas. Todas precisam ser validas.");
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        const payload = { ...payloads[0] };
        if (!payload) {
          alert("Nao foi possivel montar os dados para atualizar o compromisso.");
          setSaving(false);
          return;
        }
        if (editingEntry?.grupo_id) {
          payload.grupo_id = editingEntry.grupo_id;
        }
        const { data, error: updateError } = await supabase
          .from("agenda_financeira")
          .update(payload)
          .eq("id", editingId)
          .select("*")
          .single();
        if (updateError) throw updateError;
        setEntries((current) =>
          sortEntries(current.map((entry) => (entry.id === editingId ? data : entry))),
        );
        setEditingId(null);
        setEditingEntry(null);
        setForm((prev) => ({
          ...initialForm,
          type: prev.type,
          parcelas: buildParcelArray(1),
        }));
      } else {
        const { data, error: insertError } = await supabase
          .from("agenda_financeira")
          .insert(payloads)
          .select("*");
        if (insertError) throw insertError;
        setEntries((current) => sortEntries([...(data ?? []), ...current]));
        setForm((prev) => ({
          ...initialForm,
          type: prev.type,
          parcelas: buildParcelArray(1),
        }));
      }
    } catch (err) {
      console.error("Erro ao registrar compromisso financeiro", err, payloads);
      alert(err?.message ?? "Nao foi possivel salvar o compromisso. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, nextStatus) => {
    try {
      const { data, error: updateError } = await supabase
        .from("agenda_financeira")
        .update({ status: nextStatus })
        .eq("id", id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      setEntries((current) =>
        sortEntries(current.map((entry) => (entry.id === id ? data : entry))),
      );
      if (editingId === id) {
        setEditingEntry(data);
      }
    } catch (err) {
      console.error("Erro ao atualizar status da agenda financeira", err);
      alert("Nao foi possivel atualizar o status. Tente novamente.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remover este compromisso da agenda?")) return;
    try {
      const { error: deleteError } = await supabase
        .from("agenda_financeira")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;
      setEntries((current) => current.filter((entry) => entry.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditingEntry(null);
        setForm((prev) => ({
          ...initialForm,
          type: prev.type,
          parcelas: buildParcelArray(1),
        }));
      }
    } catch (err) {
      console.error("Erro ao excluir compromisso financeiro", err);
      alert("Nao foi possivel remover o compromisso.");
    }
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setEditingEntry(entry);
    const offset = Number(entry.dias_apos_emissao) || 0;
    const parcelValue =
      entry.valor_parcela !== null && entry.valor_parcela !== undefined
        ? entry.valor_parcela
        : entry.valor ?? "";
    const contatoIdValue =
      entry.contato_id === null || entry.contato_id === undefined
        ? IMPOSTO_CONTACT_OPTION.value
        : String(entry.contato_id);
    const isPayingEntry = (entry.tipo || initialForm.type) === "pagar";
    setForm({
      ...initialForm,
      type: entry.tipo || initialForm.type,
      contatoId: contatoIdValue,
      descricao: entry.descricao || "",
      valor:
        parcelValue !== "" && parcelValue !== null && parcelValue !== undefined
          ? String(parcelValue)
          : "",
      formaPagamento: entry.forma_pagamento || "",
      dataEmissao: formatIsoDate(entry.data_emissao) || "",
      numeroParcelas: 1,
      parcelas: [
        {
          offsetDays: offset,
          valor:
            parcelValue !== "" && parcelValue !== null && parcelValue !== undefined
              ? String(parcelValue)
              : "",
          customDate: isPayingEntry
            ? formatIsoDate(entry.data_prevista)
            : null,
        },
      ],
      adiantamentoValor:
        entry.adiantamento_valor !== null && entry.adiantamento_valor !== undefined
          ? String(entry.adiantamento_valor)
          : "",
      adiantamentoData: formatIsoDate(entry.adiantamento_data) || "",
      status: entry.status || "pendente",
      observacoes: entry.observacoes || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingEntry(null);
    setForm((prev) => ({
      ...initialForm,
      type: prev.type ?? initialForm.type,
      parcelas: buildParcelArray(1),
    }));
  };

  const statusOptionsForForm = getStatusOptions(form.type);
  const isEditing = Boolean(editingId);
  const isPaying = form.type === "pagar";
  const dueDateLabel = isPaying ? "Data do vencimento" : "Data prevista";
  const upcomingNames = upcomingHighlight ? resolveEntryNames(upcomingHighlight) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <WltLogoMark className="h-10 w-auto" title="Logo WLT" />
              <h1 className="text-xl font-semibold text-slate-800">Agenda financeira</h1>
            </div>
            <p className="text-sm text-slate-500">
              Cadastre pagamentos a fornecedores e recebimentos de clientes para organizar o caixa dos proximos dias.
            </p>
          </div>
          <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {upcomingHighlight ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Proximo compromisso
                </p>
                <p className="mt-1 font-semibold text-slate-700">
                  {formatDateDisplay(upcomingHighlight.data_prevista)} -{" "}
                  {getTypeActionLabel(upcomingHighlight.tipo)}{" "}
                  {upcomingNames?.displayCompany || upcomingNames?.displayContact}
                </p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(upcomingHighlight.valor_parcela ?? upcomingHighlight.valor)} - Parcela{" "}
                  {upcomingHighlight.parcela_numero ?? 1}/{upcomingHighlight.parcelas_total ?? 1} -{" "}
                  Status: {upcomingHighlight.status || "pendente"}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Nenhum compromisso futuro cadastrado.
              </p>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 md:flex-row md:items-center md:justify-between">
            <div>
              <strong>Editando compromisso</strong>{" "}
              {editingEntry?.contato_nome ? `para ${editingEntry.contato_nome}` : ""}
              {editingEntry?.data_prevista
                ? ` com vencimento em ${formatDateDisplay(editingEntry.data_prevista)}`
                : ""}
              .
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-sm font-semibold text-amber-700 underline hover:text-amber-800"
            >
              Cancelar edicao
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Tipo
            <select
              value={form.type}
              onChange={handleFieldChange("type")}
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Cliente / Fornecedor
            <select
              value={form.contatoId}
              onChange={handleFieldChange("contatoId")}
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">Selecione um contato</option>
              <option value={IMPOSTO_CONTACT_OPTION.value}>
                {IMPOSTO_CONTACT_OPTION.label}
              </option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.nome}
                  {contact.empresa ? ` - ${contact.empresa}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Valor total (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.valor}
              onChange={handleFieldChange("valor")}
              className="mt-1 rounded-lg border px-3 py-2 text-sm text-right focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Forma de pagamento
            <input
              type="text"
              value={form.formaPagamento}
              onChange={handleFieldChange("formaPagamento")}
              placeholder="Ex: Boleto, Pix, Cartao..."
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Data de emissao
            <input
              type="date"
              value={form.dataEmissao}
              onChange={handleFieldChange("dataEmissao")}
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Numero de parcelas
            <select
              value={form.numeroParcelas}
              onChange={handleParcelCountChange}
              disabled={isEditing}
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {count}x
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Status inicial
            <select
              value={form.status}
              data-status={form.status}
              onChange={handleFieldChange("status")}
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {statusOptionsForForm.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2 lg:col-span-3">
            Descricao
            <input
              type="text"
              value={form.descricao}
              onChange={handleFieldChange("descricao")}
              placeholder="Ex: Parcelamento da NFE 12345"
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2 lg:col-span-3">
            Observacoes
            <textarea
              rows={2}
              value={form.observacoes}
              onChange={handleFieldChange("observacoes")}
              placeholder="Detalhes adicionais sobre o compromisso"
              className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>

          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Detalhes das parcelas
            </p>
            <div className="mt-3 space-y-3">
              {form.parcelas.slice(0, form.numeroParcelas).map((parcela, index) => {
                const offset = Number(parcela.offsetDays) || 0;
                const rawCustomDate =
                  parcela.customDate && parcela.customDate.trim()
                    ? parcela.customDate.trim()
                    : null;
                const computedDueDate = isPaying
                  ? parseDate(rawCustomDate) ?? parseDate(form.dataEmissao)
                  : addDays(form.dataEmissao, offset);
                const dueDateIso = computedDueDate ? formatIsoDate(computedDueDate) ?? "" : "";
                const dueDateDisplay = computedDueDate
                  ? computedDueDate.toLocaleDateString("pt-BR")
                  : "-";
                const parcelGridClass = isPaying
                  ? "grid gap-3 rounded-lg border bg-slate-50 px-4 py-3 text-sm md:grid-cols-1 lg:grid-cols-3"
                  : "grid gap-3 rounded-lg border bg-slate-50 px-4 py-3 text-sm md:grid-cols-2 lg:grid-cols-4";
                return (
                  <div key={index} className={parcelGridClass}>
                    {!isPaying && (
                      <div className="flex flex-col font-medium text-slate-600">
                        Dias apos emissao
                        <input
                          type="number"
                          min="0"
                          value={parcela.offsetDays}
                          onChange={handleParcelaFieldChange(index, "offsetDays")}
                          className="mt-1 rounded-md border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </div>
                    )}
                    <div className="flex flex-col font-medium text-slate-600">
                      {dueDateLabel}
                      {isPaying ? (
                        <input
                          type="date"
                          value={rawCustomDate ?? dueDateIso}
                          onChange={handleParcelaFieldChange(index, "customDate")}
                          className="mt-1 rounded-md border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      ) : (
                        <input
                          type="text"
                          value={dueDateDisplay}
                          readOnly
                          className="mt-1 rounded-md border bg-white px-3 py-2 text-sm text-slate-500"
                        />
                      )}
                    </div>
                    <div className="flex flex-col font-medium text-slate-600">
                      Valor da parcela (R$)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={parcela.valor}
                        onChange={handleParcelaFieldChange(index, "valor")}
                        placeholder="Opcional"
                        className="mt-1 rounded-md border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    <div className="flex flex-col justify-center text-xs text-slate-500">
                      <p>
                        Parcela {index + 1} de {form.numeroParcelas}. Se o valor nao for informado, o total sera dividido igualmente.
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col text-sm font-medium text-slate-600">
              Adiantamento (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.adiantamentoValor}
                onChange={handleFieldChange("adiantamentoValor")}
                placeholder="Opcional"
                className="mt-1 rounded-lg border px-3 py-2 text-sm text-right focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600">
              Data do adiantamento
              <input
                type="date"
                value={form.adiantamentoData}
                onChange={handleFieldChange("adiantamentoData")}
                className="mt-1 rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </label>
          </div>

          <div className="md:col-span-2 lg:col-span-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving
                ? "Salvando..."
                : isEditing
                ? "Salvar alteracoes"
                : "Adicionar compromisso"}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Compromissos cadastrados</h2>
            <p className="text-sm text-slate-500">
              Filtre por contato, descricao ou forma de pagamento para localizar um compromisso especifico.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar na agenda..."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-72"
            />
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            Erro ao carregar a agenda: {error.message}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Carregando agenda financeira...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            Nenhum compromisso cadastrado para os proximos dias.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Data</th>
                  <th className="px-4 py-2 text-left">Contato</th>
                  <th className="px-4 py-2 text-left">Cliente</th>
                  <th className="px-4 py-2 text-left">Parcela</th>
                  <th className="px-4 py-2 text-left">Forma / Adiantamento</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Observacoes</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEntries.map((entry) => {
                  const statusOptions = getStatusOptions(entry.tipo);
                  const highlightValue = entry.valor_parcela ?? entry.valor ?? 0;
                  const adiantamentoValue =
                    entry.adiantamento_valor && Number(entry.adiantamento_valor) > 0
                      ? Number(entry.adiantamento_valor)
                      : null;
                  const { displayContact, displayCompany } = resolveEntryNames(entry);
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 text-slate-600">
                        <p className="font-medium text-slate-700">
                          {formatDateDisplay(entry.data_prevista)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Emissao: {formatDateDisplay(entry.data_emissao)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <p className="font-semibold text-slate-700">
                          {displayContact}
                        </p>
                        <p className="text-xs uppercase text-slate-400">
                          {entry.tipo}
                        </p>
                        {entry.descricao && (
                          <p className="text-xs text-slate-500">{entry.descricao}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p>{displayCompany || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p className="font-semibold text-slate-700">
                          Parcela {entry.parcela_numero ?? 1}/{entry.parcelas_total ?? 1}
                        </p>
                        {entry.tipo !== "pagar" && (
                          <p className="text-xs text-slate-400">
                            {entry.dias_apos_emissao ?? 0} dias apos emissao
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p>{entry.forma_pagamento || "-"}</p>
                        {adiantamentoValue !== null && (
                          <p className="text-xs text-slate-500">
                            Adiantamento: {formatCurrency(adiantamentoValue)}
                            {entry.adiantamento_data
                              ? ` (${formatDateDisplay(entry.adiantamento_data)})`
                              : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency(highlightValue)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={entry.status || "pendente"}
                          data-status={(entry.status || "pendente").toLowerCase()}
                          onChange={(event) => handleStatusChange(entry.id, event.target.value)}
                          className="rounded border px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {entry.observacoes || "-"}
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
                            onClick={() => handleDelete(entry.id)}
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
