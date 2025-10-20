import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { projectDefinitions } from "../data/dispenserComponents";
import WltLogoMark from "../components/WltLogoMark";

const initialForm = {
  type: "cliente",
  name: "",
  company: "",
  email: "",
  phone: "",
  notes: "",
  projects: [],
};

const TYPES = [
  { value: "cliente", label: "Clientes" },
  { value: "fornecedor", label: "Fornecedores" },
];

const sortByName = (list) => list.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

export default function ContactsPage() {
  const [form, setForm] = useState(initialForm);
  const [contacts, setContacts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const projectMap = useMemo(() => {
    return projectDefinitions.reduce((acc, project) => {
      acc[project.id] = project;
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    const loadContacts = async () => {
      setLoading(true);
      try {
        const [{ data: contactsData, error: contactsError }, { data: assignmentsData, error: assignmentsError } ] =
          await Promise.all([
            supabase.from("contatos").select("*").order("nome", { ascending: true }),
            supabase.from("contato_projetos").select("*")
          ]);

        if (contactsError) throw contactsError;
        if (assignmentsError) throw assignmentsError;

        const assignments = (assignmentsData ?? []).reduce((acc, item) => {
          if (!acc[item.contato_id]) acc[item.contato_id] = [];
          acc[item.contato_id].push(item.projeto_id);
          return acc;
        }, {});

        const enriched = (contactsData ?? []).map((contact) => ({
          ...contact,
          projectIds: assignments[contact.id] ?? [],
        }));

        setContacts(sortByName(enriched));
      } catch (err) {
        console.error("Erro ao carregar contatos", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, []);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((contact) =>
        activeTypeFilter === "all" ? true : contact.tipo === activeTypeFilter,
      )
      .filter((contact) => {
        if (!search.trim()) return true;
        const normalized = search.trim().toLowerCase();
        return [contact.nome, contact.empresa, contact.email, contact.telefone]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(normalized));
      });
  }, [contacts, activeTypeFilter, search]);

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const toggleProject = (projectId) => {
    setForm((prev) => {
      const projects = prev.projects.includes(projectId)
        ? prev.projects.filter((id) => id !== projectId)
        : [...prev.projects, projectId];
      return { ...prev, projects };
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      alert("Informe o nome do contato.");
      return;
    }

    const payload = {
      tipo: form.type,
      nome: form.name.trim(),
      empresa: form.company.trim() || null,
      email: form.email.trim() || null,
      telefone: form.phone.trim() || null,
      observacoes: form.notes.trim() || null,
    };

    try {
      setSaving(true);
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from("contatos")
          .update(payload)
          .eq("id", editingId)
          .select("*")
          .single();
        if (updateError) throw updateError;

        await supabase.from("contato_projetos").delete().eq("contato_id", editingId);
        if (form.projects.length) {
          await supabase.from("contato_projetos").insert(
            form.projects.map((projectId) => ({ contato_id: editingId, projeto_id: projectId })),
          );
        }

        setContacts((current) =>
          sortByName(
            current.map((contact) =>
              contact.id === editingId
                ? { ...contact, ...data, projectIds: [...form.projects] }
                : contact,
            ),
          ),
        );
      } else {
        const { data, error: insertError } = await supabase
          .from("contatos")
          .insert(payload)
          .select("*")
          .single();
        if (insertError) throw insertError;

        if (form.projects.length) {
          await supabase.from("contato_projetos").insert(
            form.projects.map((projectId) => ({ contato_id: data.id, projeto_id: projectId })),
          );
        }

        setContacts((current) =>
          sortByName([...current, { ...data, projectIds: [...form.projects] }]),
        );
      }

      resetForm();
    } catch (err) {
      console.error("Erro ao salvar contato", err);
      alert("Nao foi possivel salvar o contato.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contact) => {
    setEditingId(contact.id);
    setForm({
      type: contact.tipo,
      name: contact.nome,
      company: contact.empresa ?? "",
      email: contact.email ?? "",
      phone: contact.telefone ?? "",
      notes: contact.observacoes ?? "",
      projects: contact.projectIds ?? [],
    });
  };

  const handleDelete = async (id) => {
    if (!confirm("Remover este contato?")) return;
    try {
      await supabase.from("contato_projetos").delete().eq("contato_id", id);
      const { error: deleteError } = await supabase.from("contatos").delete().eq("id", id);
      if (deleteError) throw deleteError;
      setContacts((current) => current.filter((contact) => contact.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      console.error("Erro ao excluir contato", err);
      alert("Nao foi possivel excluir o contato.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WltLogoMark className="h-10 w-auto" title="Logo WLT" />
            <h1 className="text-xl font-semibold text-slate-800">Clientes e Fornecedores</h1>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-semibold text-sky-600 hover:underline"
            >
              Cancelar edicao
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Cadastre contatos e associe as placas prontas que cada cliente utiliza.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Tipo
            <select
              value={form.type}
              onChange={handleFormChange("type")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Nome do contato
            <input
              type="text"
              value={form.name}
              onChange={handleFormChange("name")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Ex: Maria Silva"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Empresa / Razao social
            <input
              type="text"
              value={form.company}
              onChange={handleFormChange("company")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Ex: NAS Engenharia"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={handleFormChange("email")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="contato@empresa.com"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Telefone / WhatsApp
            <input
              type="tel"
              value={form.phone}
              onChange={handleFormChange("phone")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="(11) 99999-9999"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2 lg:col-span-3">
            Observacoes
            <textarea
              rows={3}
              value={form.notes}
              onChange={handleFormChange("notes")}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Detalhes adicionais sobre o contato"
            />
          </label>
          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Placas associadas
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {projectDefinitions.map((project) => (
                <label
                  key={project.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    form.projects.includes(project.id)
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.projects.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span>
                    {project.name}
                    <span className="block text-xs text-slate-400">
                      {project.finishedBoardCode}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Adicionar contato"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTypeFilter("all")}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                activeTypeFilter === "all" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Todos
            </button>
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveTypeFilter(option.value)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  activeTypeFilter === option.value
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, empresa, telefone..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 lg:w-80"
          />
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Carregando contatos...</p>
        ) : filteredContacts.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Nenhum contato encontrado.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Nome</th>
                  <th className="px-4 py-2 text-left">Empresa</th>
                  <th className="px-4 py-2 text-left">Contato</th>
                  <th className="px-4 py-2 text-left">Placas associadas</th>
                  <th className="px-4 py-2 text-left">Observacoes</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-4 py-3 uppercase text-xs text-slate-500">{contact.tipo}</td>
                    <td className="px-4 py-3 text-slate-700">{contact.nome}</td>
                    <td className="px-4 py-3 text-slate-600">{contact.empresa || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="space-y-1">
                        {contact.email && <p>{contact.email}</p>}
                        {contact.telefone && <p>{contact.telefone}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex flex-wrap gap-2">
                        {(contact.projectIds ?? []).length === 0 && (
                          <span className="text-xs text-slate-400">Nenhuma placa vinculada</span>
                        )}
                        {(contact.projectIds ?? []).map((projectId) => {
                          const project = projectMap[projectId];
                          if (!project) return null;
                          return (
                            <span
                              key={projectId}
                              className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                            >
                              {project.finishedBoardCode}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{contact.observacoes || "-"}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(contact)}
                        className="text-sm font-medium text-sky-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(contact.id)}
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
