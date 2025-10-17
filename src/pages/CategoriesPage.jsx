import { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';

/**
 * CategoriesPage allows users to view, add and remove categories. Categories
 * organize inventory items and make it easier to filter and report.
 */
export default function CategoriesPage() {
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useInventory();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await addCategory({ name: newName });
      setNewName('');
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    setError('');
    try {
      await updateCategory(editingId, { name: editName });
      setEditingId(null);
      setEditName('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Excluir esta categoria?')) {
      try {
        await deleteCategory(id);
      } catch (err) {
        alert('Erro ao excluir: ' + err.message);
      }
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Categorias</h1>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={editingId ? handleEdit : handleAdd} className="mb-6">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={editingId ? editName : newName}
            onChange={(e) =>
              editingId ? setEditName(e.target.value) : setNewName(e.target.value)
            }
            placeholder="Nome da categoria"
            required
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            {editingId ? 'Salvar' : 'Adicionar'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEditName('');
              }}
              className="text-gray-600 hover:underline"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded shadow">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Nome</th>
              <th className="px-4 py-2 w-20">Ações</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-t">
                <td className="px-4 py-2">{cat.name}</td>
                <td className="px-4 py-2 space-x-2">
                  <button
                    onClick={() => startEdit(cat)}
                    className="text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
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