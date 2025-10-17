import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useInventory } from "../context/InventoryContext";

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
  const [filtered, setFiltered] = useState([]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const lower = filter.toLowerCase();
    setFiltered(
      items.filter((item) => {
        const categoryName =
          categories.find((c) => c.id === item.category_id)?.name.toLowerCase() ?? "";
        return (
          item.name.toLowerCase().includes(lower) ||
          categoryName.includes(lower) ||
          (item.code && item.code.toLowerCase().includes(lower))
        );
      }),
    );
  }, [items, categories, filter]);

  if (loading) return <p>Carregando itens...</p>;
  if (error) return <p>Erro ao carregar itens: {error.message}</p>;

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir este item?")) {
      try {
        await deleteItem(id);
      } catch (err) {
        alert("Erro ao excluir item: " + err.message);
      }
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estoque</h1>
        <Link
          to="/inventory/new"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Novo item
        </Link>
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
            {filtered.map((item, index) => (
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
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:underline"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
