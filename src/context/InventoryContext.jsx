import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { inventorySeedComponents } from '../data/dispenserComponents';

const normalizeValue = (value) => (value ? value.toString().trim().toLowerCase() : '');

const dedupeItems = (list) => {
  const seen = new Set();
  return list.filter((item) => {
    const candidates = [];
    const codeKey = normalizeValue(item.code);
    if (codeKey) candidates.push(`code:${codeKey}`);
    const nameKey = normalizeValue(item.name);
    if (nameKey) candidates.push(`name:${nameKey}`);
    const legacyMatch = item.name ? item.name.match(/^(\d{3,4})\s*-\s*(.+)$/) : null;
    if (legacyMatch) {
      candidates.push(`legacy-code:${normalizeValue(legacyMatch[1])}`);
      candidates.push(`legacy-name:${normalizeValue(legacyMatch[2])}`);
    }
    const hasSeen = candidates.some((candidate) => candidate && seen.has(candidate));
    if (hasSeen) return false;
    candidates.forEach((candidate) => candidate && seen.add(candidate));
    return true;
  });
};

const ITEM_COLUMN_OPTIONS = {
  code: ['codigo', 'code'],
  name: ['name', 'nome'],
  description: ['description', 'descricao'],
  category_id: ['category_id', 'categoria_id'],
  quantity: ['quantity', 'quantidade'],
  location: ['location', 'localizacao'],
};

const DEFAULT_ITEM_COLUMNS = {
  code: null,
  name: 'nome',
  description: 'descricao',
  category_id: 'categoria_id',
  quantity: 'quantidade',
  location: 'localizacao',
};

/**
 * InventoryContext encapsulates all data fetching and mutation logic
 * for inventory items and categories. Components can subscribe to this
 * context to access items, categories and related operations without
 * worrying about Supabase API calls.
 */
const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itemColumns, setItemColumns] = useState(DEFAULT_ITEM_COLUMNS);

  // Fetch items and categories when the component mounts
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchItems();
        await fetchCategories();
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const detectItemColumns = (rows) => {
    if (!rows?.length) return itemColumns;
    const updated = { ...itemColumns };

    rows.forEach((row) => {
      Object.entries(ITEM_COLUMN_OPTIONS).forEach(([field, options]) => {
        const found = options.find((candidate) => candidate in row);
        if (found) {
          updated[field] = found;
        }
      });
    });

    setItemColumns(updated);
    return updated;
  };

  const resolveColumnError = (supabaseError, currentMapping = itemColumns) => {
    const message = supabaseError?.message || '';
    const match =
      message.match(/'([^']+)' column of 'itens'/i) ||
      message.match(/column ([^ ]+) of table itens/i);

    if (!match) return null;

    const missing = match[1];
    const entry = Object.entries(ITEM_COLUMN_OPTIONS).find(([, options]) =>
      options.includes(missing),
    );

    if (!entry) return null;

    const [field, options] = entry;
    const alternative = options.find((candidate) => candidate !== missing);
    if (!alternative) return null;

    const next = { ...currentMapping, [field]: alternative };
    setItemColumns(next);
    return next;
  };

const toAppItem = (row, columns = itemColumns) => ({
  ...row,
  code: columns.code ? row?.[columns.code] ?? null : null,
  name: row?.[columns.name] ?? '',
  description: row?.[columns.description] ?? '',
  category_id: row?.[columns.category_id] ?? null,
  quantity: row?.[columns.quantity] ?? 0,
  location: row?.[columns.location] ?? '',
  });

const toDbItem = (item, columns = itemColumns) => {
  const payload = {};
  if (columns.code && 'code' in item) payload[columns.code] = item.code;
  if ('name' in item) payload[columns.name] = item.name;
  if ('description' in item) payload[columns.description] = item.description;
  if ('category_id' in item) payload[columns.category_id] = item.category_id;
  if ('quantity' in item) payload[columns.quantity] = item.quantity;
  if ('location' in item) payload[columns.location] = item.location;
    return payload;
  };

  const toAppCategory = (row) => ({
    ...row,
    name: row.name ?? row.nome ?? '',
    description: row.description ?? row.descricao ?? '',
  });

  const toDbCategory = (category) => {
    const payload = {};
    if ('name' in category) payload.nome = category.name;
    if ('description' in category) payload.descricao = category.description;
    return payload;
  };

  /**
   * Fetch all items from the 'items' table. Applies sorting by name by default.
   */
  const matchesSeed = (seed, item) => {
    const normalizedName = normalizeValue(item.name);
    const normalizedSeedName = normalizeValue(seed.inventoryName);
    const itemCode = normalizeValue(item.code);
    const seedCode = normalizeValue(seed.code);

    const codeMatch = Boolean(itemCode && seedCode && itemCode === seedCode);
    const nameMatch = normalizedName === normalizedSeedName;

    return codeMatch || nameMatch;
  };

  const ensureSeedInventory = async (currentItems, columns) => {
    const missingSeeds = inventorySeedComponents.filter(
      (seed) => !currentItems.some((item) => matchesSeed(seed, item)),
    );

    if (!missingSeeds.length) {
      return currentItems;
    }

    const mapInsertedItems = (rows, seedsList) => {
      const normalizedColumns = detectItemColumns(rows);
      return rows.map((row, index) => {
        const mapped = toAppItem(row, normalizedColumns);
        if (!mapped.code && seedsList[index]?.code) {
          mapped.code = seedsList[index].code;
        }
        return mapped;
      });
    };

    const attemptInsert = async (mapping) => {
      const insertPayload = missingSeeds.map((seed) =>
        toDbItem(
          {
            code: seed.code,
            name: seed.inventoryName,
            description: seed.inventoryDescription,
            quantity: seed.initialStock,
            location: seed.storageLocation,
          },
          mapping,
        ),
      );

      const { data, error } = await supabase.from('itens').insert(insertPayload).select('*');
      return { data, error };
    };

    const { data, error } = await attemptInsert(columns);
    if (error) {
      const adjustedColumns = resolveColumnError(error, columns);
      if (!adjustedColumns) throw error;
      const retry = await attemptInsert(adjustedColumns);
      if (retry.error) throw retry.error;
      const mappedInserted = mapInsertedItems(retry.data, missingSeeds);
      return [...mappedInserted, ...currentItems];
    }

    const mapped = mapInsertedItems(data, missingSeeds);
    return [...mapped, ...currentItems];
  };

  const fetchItems = async () => {
    const { data, error } = await supabase.from('itens').select('*');
    if (error) throw error;
    const effectiveColumns = detectItemColumns(data);
    const mapped = data.map((row) => toAppItem(row, effectiveColumns));
    const withSeeds = await ensureSeedInventory(mapped, effectiveColumns);
    const prioritized = withSeeds
      .slice()
      .sort((a, b) => (b.code ? 1 : 0) - (a.code ? 1 : 0));
    const deduped = dedupeItems(prioritized);
    const sorted = deduped.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    setItems(sorted);
    return sorted;
  };

  /**
   * Fetch all categories from the 'categories' table. Applies sorting by name.
   */
  const fetchCategories = async () => {
    const { data, error } = await supabase.from('categorias').select('*').order('nome');
    if (error) throw error;
    const mapped = data.map(toAppCategory);
    setCategories(mapped);
    return mapped;
  };

  /**
   * Add a new item to the database and update local state.
   * @param {Object} item - The item fields to insert.
   */
  const addItem = async (item) => {
    const insert = async (mapping) =>
      supabase.from('itens').insert(toDbItem(item, mapping)).select().single();

    const { data, error } = await insert(itemColumns);
    if (error) {
      const adjustedColumns = resolveColumnError(error, itemColumns);
      if (!adjustedColumns) throw error;
      const retry = await insert(adjustedColumns);
      if (retry.error) throw retry.error;
      const normalizedColumns = detectItemColumns([retry.data]);
      const mappedRetry = toAppItem(retry.data, normalizedColumns);
      setItems((prev) => [...prev, mappedRetry]);
      return mappedRetry;
    }

    const normalizedColumns = detectItemColumns([data]);
    const mapped = toAppItem(data, normalizedColumns);
    setItems((prev) => [...prev, mapped]);
    return mapped;
  };

  /**
   * Update an existing item. Accepts the primary key and a partial update.
   * @param {String|Number} id - The primary key of the item.
   * @param {Object} updates - The fields to update.
   */
  const updateItem = async (id, updates) => {
    const { data, error } = await supabase
      .from('itens')
      .update(toDbItem(updates))
      .eq('id', id)
      .select()
      .single();
    if (error) {
      const adjustedColumns = resolveColumnError(error, itemColumns);
      if (!adjustedColumns) throw error;
      const retry = await supabase
        .from('itens')
        .update(toDbItem(updates, adjustedColumns))
        .eq('id', id)
        .select()
        .single();
      if (retry.error) throw retry.error;
      const normalizedColumns = detectItemColumns([retry.data]);
      const mappedRetry = toAppItem(retry.data, normalizedColumns);
      setItems((prev) => prev.map((item) => (item.id === id ? mappedRetry : item)));
      return mappedRetry;
    }
    const normalizedColumns = detectItemColumns([data]);
    const mapped = toAppItem(data, normalizedColumns);
    setItems((prev) => prev.map((item) => (item.id === id ? mapped : item)));
    return mapped;
  };

  /**
   * Delete an item by id.
   * @param {String|Number} id - The primary key of the item to delete.
   */
  const deleteItem = async (id) => {
    const { error } = await supabase.from('itens').delete().eq('id', id);
    if (error) throw error;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  /**
   * Add a new category to the database and update local state.
   */
  const addCategory = async (category) => {
    const { data, error } = await supabase
      .from('categorias')
      .insert(toDbCategory(category))
      .select()
      .single();
    if (error) throw error;
    const mapped = toAppCategory(data);
    setCategories((prev) => [...prev, mapped]);
    return mapped;
  };

  /**
   * Update an existing category by id.
   */
  const updateCategory = async (id, updates) => {
    const { data, error } = await supabase
      .from('categorias')
      .update(toDbCategory(updates))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const mapped = toAppCategory(data);
    setCategories((prev) => prev.map((cat) => (cat.id === id ? mapped : cat)));
    return mapped;
  };

  /**
   * Delete a category by id.
   */
  const deleteCategory = async (id) => {
    const { error } = await supabase.from('categorias').delete().eq('id', id);
    if (error) throw error;
    setCategories((prev) => prev.filter((cat) => cat.id !== id));
  };

  return (
    <InventoryContext.Provider
      value={{
        items,
        categories,
        loading,
        error,
        fetchItems,
        fetchCategories,
        addItem,
        updateItem,
        deleteItem,
        addCategory,
        updateCategory,
        deleteCategory,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export const useInventory = () => useContext(InventoryContext);
