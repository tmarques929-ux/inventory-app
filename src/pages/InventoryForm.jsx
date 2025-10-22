import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useInventory } from '../context/InventoryContext';
import WltLogoMark from '../components/WltLogoMark';
import { useNotifications } from '../context/NotificationContext';
import { usePermissions } from '../context/PermissionsContext';

/**
 * InventoryForm handles creation and editing of items. When an `id` is provided
 * in the route params, the form will load the existing item and update it
 * on submit. Otherwise a new item will be inserted into Supabase.
 */
export default function InventoryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    items,
    addItem,
    updateItem,
    fetchItems,
  } = useInventory();
  const { hasPermission } = usePermissions();
  const { notifyError } = useNotifications();
  const canManageStock = hasPermission("manageStock");
  const isEditMode = Boolean(id);
  const [formState, setFormState] = useState({
    name: '',
    description: '',
    quantity: 0,
    currentPrice: '',
    lastPrice: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canManageStock) {
      notifyError("Voce nao tem permissao para alterar o estoque.");
      navigate("/inventory", { replace: true });
    }
  }, [canManageStock, navigate, notifyError]);

  // On mount, populate form state if editing an existing item
  useEffect(() => {
    if (isEditMode) {
      const existing = items.find((it) => String(it.id) === String(id));
      if (existing) {
        setFormState({
          name: existing.name,
          description: existing.description || '',
          quantity: existing.quantity,
          currentPrice:
            existing.currentPrice !== null && existing.currentPrice !== undefined
              ? String(existing.currentPrice)
              : '',
          lastPrice:
            existing.lastPrice !== null && existing.lastPrice !== undefined
              ? String(existing.lastPrice)
              : '',
        });
      }
    }
  }, [id, isEditMode, items]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canManageStock) {
      notifyError("Voce nao tem permissao para alterar o estoque.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const parsePrice = (value) => {
        if (value === '' || value === null || value === undefined) return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };
      const payload = {
        ...formState,
        quantity: parseInt(formState.quantity, 10),
        currentPrice: parsePrice(formState.currentPrice),
        lastPrice: parsePrice(formState.lastPrice),
        location: '',
      };
      if (isEditMode) {
        await updateItem(id, payload);
      } else {
        await addItem(payload);
      }
      await fetchItems();
      navigate('/inventory');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!canManageStock) {
    return null;
  }
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <WltLogoMark className="h-10 w-auto" title="Logo WLT" />
        <h1 className="text-2xl font-semibold">
          {isEditMode ? 'Editar item' : 'Novo item'}
        </h1>
      </div>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formState.name}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="description">
            Descrição
          </label>
          <textarea
            id="description"
            name="description"
            value={formState.description}
            onChange={handleChange}
            rows="3"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700" htmlFor="quantity">
            Quantidade
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            value={formState.quantity}
            onChange={handleChange}
            min="0"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="lastPrice">
              Ultimo preço pago (R$)
            </label>
            <input
              id="lastPrice"
              name="lastPrice"
              type="number"
              min="0"
              step="0.01"
              value={formState.lastPrice}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="currentPrice">
              Preço atual (R$)
            </label>
            <input
              id="currentPrice"
              name="currentPrice"
              type="number"
              min="0"
              step="0.01"
              value={formState.currentPrice}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      <p className="text-xs text-gray-500">
        Toda atualização de preço atual gera automaticamente um registro no histórico de valores.
      </p>
        <div className="flex items-center space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <Link to="/inventory" className="text-gray-600 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

