import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInventory } from "../context/InventoryContext";
import WltLogoMark from "../components/WltLogoMark";
import { useNotifications } from "../context/NotificationContext";
import { usePermissions } from "../context/PermissionsContext";

/**
 * InventoryList renders a table of all items currently in inventory. Items can
 * be edited or removed via the actions column. A search filter is provided
 * for convenience.
 */
export default function InventoryList() {
  const {
    items,
    categories,
    loading,
    error,
    deleteItem,
    fetchItems,
  } = useInventory();
  const [filter, setFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { hasPermission } = usePermissions();
  const { notifyError } = useNotifications();
  const canManageStock = hasPermission("manageStock");

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    if (!lower) return items;

    return items.filter((item) => {
      const categoryName =
        categories.find((c) => c.id === item.category_id)?.name.toLowerCase() ?? "";
      return (
        item.name.toLowerCase().includes(lower) ||
        categoryName.includes(lower) ||
        (item.code && item.code.toLowerCase().includes(lower))
      );
    });
  }, [items, categories, filter]);

  if (loading) return <p>Carregando itens...</p>;
  if (error) return <p>Erro ao carregar itens: {error.message}</p>;

  const requestDelete = (item) => {
    if (!canManageStock) {
      notifyError("Voce nao tem permissao para alterar o estoque.");
      return;
    }
    setPendingDelete(item);
    setDeleteError("");
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (!canManageStock) {
      notifyError("Voce nao tem permissao para alterar o estoque.");
      return;
    }
    setIsDeleting(true);
    try {
      await deleteItem(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err.message || "Erro ao excluir item.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WltLogoMark className="h-10 w-auto" title="Logo WLT" />
          <h1 className="text-2xl font-semibold">Estoque</h1>
        </div>
        {canManageStock ? (
          <Link
            to="/inventory/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Novo item
          </Link>
        ) : (
          <span className="rounded border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
            Sem permissao para criar
          </span>
        )}
      </div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por codigo, nome ou categoria..."
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 md:w-1/2"
        />
      </div>
      {!canManageStock && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Voce possui acesso somente para leitura. Acoes de inclusao ou exclusao estao restritas a operadores autorizados.
        </p>
      )}
      {pendingDelete && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>
            Confirma a exclus\u00E3o do item{" "}
            <span className="font-semibold text-red-800">{pendingDelete.name}</span>?
          </p>
          {deleteError && <p className="mt-2 text-xs text-red-600">{deleteError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </button>
            <button
              type="button"
              onClick={cancelDelete}
              disabled={isDeleting}
              className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:text-red-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full rounded bg-white shadow">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Codigo</th>
              <th className="px-4 py-2 text-left">Nome</th>
              <th className="px-4 py-2 text-right">Quantidade</th>
              <th className="px-4 py-2">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  {filter
                    ? "Nenhum item corresponde ao termo pesquisado."
                    : "Nenhum item cadastrado no momento."}
                </td>
              </tr>
            ) : (
              filteredItems.map((item, index) => (
                <tr
                  key={item.id}
                  className={`border-t ${index % 2 === 0 ? "bg-white" : "bg-sky-50/40"}`}
                >
                  <td className="px-4 py-2 font-mono text-sm">{item.code || "-"}</td>
                  <td className="px-4 py-2">{item.name}</td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2 space-x-2 text-center">
                    <Link
                      to={`/inventory/${item.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Editar
                    </Link>
                  {canManageStock ? (
                    <button
                      type="button"
                      onClick={() => requestDelete(item)}
                      className="text-red-600 underline-offset-4 hover:underline"
                    >
                      Excluir
                    </button>
                  ) : (
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Sem acesso
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}
