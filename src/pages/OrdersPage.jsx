import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { projectDefinitions } from "../data/dispenserComponents";

const initialForm = {
  nfe: "",
  contatoId: "",
  quantidade: "",
  projetoId: "",
  dataEntrega: "",
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );

export default function OrdersPage() {
  const [form, setForm] = useState(initialForm);
  const [orders, setOrders] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [projectPrices, setProjectPrices] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const contactMap = useMemo(() => {
    return contacts.reduce((acc, contact) => {
      acc[contact.id] = contact;
      return acc;
    }, {});
  }, [contacts]);

  const selectedContact = form.contatoId ? contactMap[form.contatoId] : null;

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("inventory-app-project-values");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            setProjectPrices(parsed);
          }
        }
      } catch (err) {
        console.error("Nao foi possivel carregar valores de projetos", err);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStorage = (event) => {
      if (event.key === "inventory-app-project-values") {
        try {
          const next = event.newValue ? JSON.parse(event.newValue) : {};
          if (next && typeof next === "object") {
            setProjectPrices(next);
          }
        } catch (err) {
          console.error("Nao foi possivel atualizar valores de projetos", err);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
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
    if (!selectedContact) return projectDefinitions;
    if (!selectedContact.projectIds || selectedContact.projectIds.length === 0)
      return projectDefinitions;
    return projectDefinitions.filter((project) =>
      selectedContact.projectIds.includes(project.id),
    );
  }, [selectedContact]);

  const linkedProjects = useMemo(() => {
    if (!selectedContact || !selectedContact.projectIds?.length) return [];
    return projectDefinitions.filter((project) =>
      selectedContact.projectIds.includes(project.id),
    );
  }, [selectedContact]);

  const getProjectUnitPrice = (projectId) => {
    if (!projectId) return 0;
    const storedValue = projectPrices?.[projectId];
    const storedNumber = Number(storedValue);
    if (Number.isFinite(storedNumber) && storedNumber > 0) return storedNumber;
    const definition = projectDefinitions.find((project) => project.id === projectId);
    const fallbackNumber = Number(definition?.defaultValue);
    return Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : 0;
  };

  const selectedProject = useMemo(() => {
    if (!form.projetoId) return null;
    return availableProjects.find((project) => project.id === form.projetoId) ?? null;
  }, [availableProjects, form.projetoId]);

  const unitPrice = selectedProject ? getProjectUnitPrice(selectedProject.id) : 0;
  const quantityNumber = Number(form.quantidade) || 0;
  const totalPrice = Number.isFinite(unitPrice * quantityNumber)
    ? Number((unitPrice * quantityNumber).toFixed(2))
    : 0;

  useEffect(() => {
    if (!availableProjects.length) return;
    if (!availableProjects.find((project) => project.id === form.projetoId)) {
      setForm((prev) => ({ ...prev, projetoId: availableProjects[0].id }));
    }
  }, [availableProjects, form.projetoId]);

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const normalized = search.toLowerCase();
    return orders.filter((entry) => {
      return [
        entry.nfe,
        entry.contato_nome,
        entry.placa_codigo,
        entry.projeto_nome,
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(normalized));
    });
  }, [orders, search]);

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    if (field === "contatoId") {
      setForm((prev) => ({ ...prev, contatoId: value, projetoId: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.nfe.trim() || !form.contatoId) {
      alert("Informe a NFE e selecione o cliente.");
      return;
    }

    const contact = selectedContact;
    const project = availableProjects.find((item) => item.id === form.projetoId) ?? availableProjects[0];

    if (!project) {
      alert("Associe pelo menos uma placa ao cliente antes de registrar o pedido.");
      return;
    }

    const payload = {
      nfe: form.nfe.trim(),
      contato_id: form.contatoId,
      contato_nome: contact?.nome ?? "",
      quantidade: Number(form.quantidade) || 0,
      projeto_id: project.id,
      projeto_nome: project.name,
      placa_codigo: project.finishedBoardCode,
      data_entrega: form.dataEntrega || null,
      valor: totalPrice,
    };

    try {
      setSaving(true);
      const { data, error: insertError } = await supabase
        .from("pedidos")
        .insert(payload)
        .select("*")
        .single();
      if (insertError) throw insertError;
      setOrders((current) => [data, ...current]);
      setForm((prev) => ({ ...initialForm, contatoId: prev.contatoId }));
    } catch (err) {
      console.error("Erro ao salvar pedido", err);
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remover este pedido?")) return;
    try {
      const { error: deleteError } = await supabase.from("pedidos").delete().eq("id", id);
      if (deleteError) throw deleteError;
      setOrders((current) => current.filter((entry) => entry.id !== id));
    } catch (err) {
      console.error("Erro ao excluir pedido", err);
      alert("Nao foi possivel excluir o pedido.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">Pedidos</h1>
        <p className="text-sm text-slate-500">
          Registre as placas vendidas para cada cliente e acompanhe as datas de entrega e faturamento.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col text-sm font-medium text-slate-600">
            NFE / Pedido
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
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.nome}
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
              {availableProjects.length === 0 && <option value="">Nenhuma placa disponivel</option>}
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.finishedBoardCode} - {project.name}
                </option>
              ))}
            </select>
          </label>
          {selectedContact && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 md:col-span-2 lg:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Placas vinculadas a {selectedContact.nome}
              </p>
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
                      {formatCurrency(getProjectUnitPrice(project.id))}
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
              value={formatCurrency(unitPrice)}
              readOnly
              className="mt-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-right font-semibold text-slate-700 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Valor total (R$)
            <input
              type="text"
              value={formatCurrency(totalPrice)}
              readOnly
              className="mt-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-right font-semibold text-slate-700 focus:outline-none"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Registrar pedido"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Pedidos cadastrados</h2>
            <p className="text-sm text-slate-500">
              Pesquise por NFE, cliente ou placa para localizar registros.
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por NFE, cliente, placa..."
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
                  <th className="px-4 py-2 text-left">NFE</th>
                  <th className="px-4 py-2 text-left">Cliente</th>
                  <th className="px-4 py-2 text-left">Placa</th>
                  <th className="px-4 py-2 text-right">Quantidade</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-left">Entrega</th>
                  <th className="px-4 py-2 text-left">Criado em</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrders.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{entry.nfe}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.contato_nome || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-700">{entry.projeto_nome || "-"}</p>
                        <p className="text-xs text-slate-400">{entry.placa_codigo || "-"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {Number(entry.quantidade ?? 0).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {formatCurrency(entry.valor)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {entry.data_entrega
                        ? new Date(entry.data_entrega).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {entry.created_at
                        ? new Date(entry.created_at).toLocaleString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
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
}
