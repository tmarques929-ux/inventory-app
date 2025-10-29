import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNotifications } from "../context/NotificationContext";
import { usePermissions } from "../context/PermissionsContext";
import { useAuth } from "../context/AuthContext";

const COMPANY_DOCUMENTS_BUCKET = "company_documents";
const SIGNED_URL_TTL = 60 * 5; // 5 minutes
const DRIVE_URL = "https://drive.google.com/drive/u/1/folders/1JK5a_cHEmGXBubdnZXR1HVBgwluCKwnV";
const DEFAULT_CATEGORIES = ["Contrato", "Financeiro", "Fiscal", "Dados bancarios", "Orcamento", "Outros"];
const CUSTOM_CATEGORY_VALUE = "__custom__";

const sanitizeStorageFileName = (rawName, fallbackPrefix = "document") => {
  if (!rawName) return `${fallbackPrefix}-${Date.now()}`;
  return rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || `${fallbackPrefix}-${Date.now()}`;
};

const fileTypeBadge = (mimeType, fileName = "") => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType?.includes("pdf") || extension === "pdf") return "PDF";
  if (mimeType?.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(extension)) return "XLS";
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "bmp", "svg"].includes(extension)) return "IMG";
  if (mimeType?.includes("word") || ["doc", "docx"].includes(extension)) return "DOC";
  if (mimeType?.includes("zip") || ["zip", "rar", "7z"].includes(extension)) return "ZIP";
  if (mimeType?.includes("powerpoint") || ["ppt", "pptx"].includes(extension)) return "PPT";
  return "FILE";
};

const formatSize = (size) => {
  if (!Number.isFinite(size)) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function DocumentsPage() {
  const { notifyError, notifySuccess } = useNotifications();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const canManageDocuments = hasPermission("manageDocuments");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [file, setFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: null, message: "" });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory(DEFAULT_CATEGORIES[0]);
    setCustomCategory("");
    setFile(null);
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documentos")
        .select("id, name, description, storage_path, mime_type, size_bytes, category, created_at, created_by")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const withUrls =
        data?.map(async (doc) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from(COMPANY_DOCUMENTS_BUCKET)
            .createSignedUrl(doc.storage_path, SIGNED_URL_TTL);
          if (signedError) {
            console.warn("Nao foi possivel gerar URL assinada para", doc.storage_path, signedError);
          }
          return {
            ...doc,
            downloadUrl: signed?.signedUrl ?? null,
          };
        }) ?? [];

      const resolved = await Promise.all(withUrls);
      setDocuments(resolved);
    } catch (err) {
      console.error("Erro ao carregar documentos", err);
      notifyError("Nao foi possivel carregar a lista de documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    const channel = supabase
      .channel("public:documentos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documentos" },
        () => fetchDocuments(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    setFile(selected);
    if (!title.trim()) {
      const baseName = selected.name.replace(/\.[^/.]+$/, "");
      setTitle(baseName);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      setStatusMessage({ type: "error", message: "Escolha um arquivo para fazer o upload." });
      return;
    }
    if (!title.trim()) {
      setStatusMessage({ type: "error", message: "Informe um titulo para o documento." });
      return;
    }
    if (!canManageDocuments) {
      setStatusMessage({ type: "error", message: "Voce nao possui permissao para enviar documentos." });
      return;
    }

    setStatusMessage({ type: null, message: "" });
    setUploading(true);
    try {
      const sanitizedName = sanitizeStorageFileName(file.name, "document");
      const extensionMatch = sanitizedName.match(/\.([^.]+)$/);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
      const baseName = extensionMatch ? sanitizedName.slice(0, -(extension.length + 1)) : sanitizedName;
      const storagePath = `${Date.now()}-${baseName}${extension ? `.${extension}` : ""}`;

      const { error: uploadError } = await supabase.storage
        .from(COMPANY_DOCUMENTS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;

      const {
        data: { user },
        error: getUserError,
      } = await supabase.auth.getUser();
      if (getUserError) throw getUserError;

      const resolvedCategory =
        category === CUSTOM_CATEGORY_VALUE ? customCategory.trim() || null : category;

      const { error: insertError } = await supabase.from("documentos").insert({
        name: title.trim(),
        description: description.trim() || null,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size ?? null,
        category: resolvedCategory,
        created_by: user?.id ?? null,
      });
      if (insertError) throw insertError;

      notifySuccess("Documento enviado com sucesso.");
      resetForm();
      fetchDocuments();
    } catch (err) {
      console.error("Falha ao enviar documento", err);
      notifyError(err?.message ?? "Nao foi possivel enviar o documento.");
      setStatusMessage({
        type: "error",
        message: err?.message ?? "Nao foi possivel enviar o documento.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId, storagePath) => {
    if (!canManageDocuments) {
      notifyError("Voce nao possui permissao para remover documentos.");
      return;
    }
    if (!documentId || !storagePath) return;
    if (!window.confirm("Deseja realmente remover este documento?")) return;
    try {
      const { error: tableError } = await supabase.from("documentos").delete().eq("id", documentId);
      if (tableError) throw tableError;

      const { error: storageError } = await supabase.storage
        .from(COMPANY_DOCUMENTS_BUCKET)
        .remove([storagePath]);
      if (storageError) {
        console.warn("Nao foi possivel remover o arquivo do storage.", storageError);
      }

      notifySuccess("Documento removido.");
      fetchDocuments();
    } catch (err) {
      console.error("Falha ao remover documento", err);
      notifyError(err?.message ?? "Nao foi possivel excluir o documento.");
    }
  };

  const documentsToDisplay = useMemo(() => documents ?? [], [documents]);
  const displayCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_CATEGORIES, ...documentsToDisplay.map((doc) => doc.category).filter(Boolean)]),
      ),
    [documentsToDisplay],
  );

  const renderDocumentsContent = () => {
    if (loading) {
      return <p className="mt-4 text-sm text-slate-500">Carregando documentos...</p>;
    }

    if (documentsToDisplay.length === 0) {
      return (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-medium text-slate-600">Nenhum documento cadastrado ate o momento.</p>
          {canManageDocuments ? (
            <p className="mt-2 text-xs text-slate-500">
              Envie um novo documento utilizando o formulario acima.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Os administradores podem adicionar documentos para esta area.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="mt-6 space-y-4">
        {documentsToDisplay.map((document) => (
          <article
            key={document.id}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-1 items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-xs font-semibold text-slate-600">
                {fileTypeBadge(document.mime_type, document.name)}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">{document.name}</h3>
                  {document.category && (
                    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {document.category}
                    </span>
                  )}
                </div>
                {document.description && <p className="text-xs text-slate-500">{document.description}</p>}
                <p className="text-xs text-slate-400">
                  {formatSize(document.size_bytes)} | {formatDateTime(document.created_at)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              {document.downloadUrl ? (
                <a
                  href={document.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  Baixar
                </a>
              ) : (
                <span className="text-xs font-medium text-amber-600">URL temporaria indisponivel</span>
              )}
              {canManageDocuments && (
                <button
                  type="button"
                  onClick={() => handleDelete(document.id, document.storage_path)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                >
                  Remover
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Central corporativa
            </p>
            <h1 className="text-2xl font-bold text-slate-800 md:text-3xl">Documentos</h1>
            <p className="mt-2 text-sm text-slate-500">
              Armazene documentos importantes e acesse rapidamente a pasta compartilhada no Google Drive.
            </p>
          </div>
          <a
            href={DRIVE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100"
          >
            Abrir pasta no Drive -&gt;
          </a>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Adicionar novo documento</h2>
        <p className="mt-2 text-sm text-slate-500">
          Use esta area para armazenar arquivos corporativos (contrato social, dados bancarios, certificados, etc.).
          Os documentos ficam disponiveis apenas para usuarios autenticados.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleUpload}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-slate-600">
              Titulo do documento
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Contrato social"
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                required
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-600">
              Arquivo
              <input
                type="file"
                onChange={handleFileChange}
                className="mt-1 text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-300"
                required
              />
            </label>
          </div>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:w-64">
            Categoria
            <select
              value={category}
              onChange={(event) => {
                const nextValue = event.target.value;
                setCategory(nextValue);
                if (nextValue !== CUSTOM_CATEGORY_VALUE) {
                  setCustomCategory("");
                }
              }}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {displayCategoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={CUSTOM_CATEGORY_VALUE}>Outra...</option>
              {category &&
                category !== CUSTOM_CATEGORY_VALUE &&
                !displayCategoryOptions.includes(category) && (
                  <option value={category}>{category}</option>
                )}
            </select>
            {category === CUSTOM_CATEGORY_VALUE && (
              <input
                type="text"
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                placeholder="Digite a categoria"
                className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                required
              />
            )}
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Descricao (opcional)
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: Versao atualizada do contrato social."
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>

          {statusMessage.message && (
            <p
              className={`text-sm ${statusMessage.type === "error" ? "text-rose-600" : "text-emerald-600"}`}
            >
              {statusMessage.message}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={uploading || !canManageDocuments}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-sky-400"
            >
              {uploading ? "Enviando..." : canManageDocuments ? "Enviar documento" : "Sem permissao"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Limpar
            </button>
          </div>
        </form>
        {!canManageDocuments && (
          <p className="mt-3 text-xs text-amber-600">
            Voce possui acesso apenas para visualizar documentos. Solicite a um administrador para liberar o envio.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Arquivos armazenados</h2>
        {renderDocumentsContent()}
      </section>
    </div>
  );
}
