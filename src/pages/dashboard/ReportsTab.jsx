import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../../supabaseClient";

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatConstraintLabel = (lot, moq) => {
  const parts = [];
  const lotNumber = Number(lot);
  const moqNumber = Number(moq);
  if (Number.isFinite(lotNumber) && lotNumber > 0) {
    parts.push(`Lote ${lotNumber.toLocaleString("pt-BR")}`);
  }
  if (
    Number.isFinite(moqNumber) &&
    moqNumber > 0 &&
    (!Number.isFinite(lotNumber) || moqNumber !== lotNumber)
  ) {
    parts.push(`MOQ ${moqNumber.toLocaleString("pt-BR")}`);
  }
  return parts.join(" · ");
};

const RECEIVED_STATUSES = new Set(["recebido", "confirmado"]);
const PAID_STATUSES = new Set(["pago", "paga", "liquidado"]);

const PURCHASE_ORDER_STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" },
  { value: "enviado", label: "Enviado ao fornecedor" },
  { value: "parcialmente_recebido", label: "Parcialmente recebido" },
  { value: "concluido", label: "Concluído" },
];

const parseDateParts = (value, fallback) => {
  const source = value || fallback;
  if (!source) return null;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
};

const formatMonthLabel = (year, month) => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const formatYearLabel = (year) => year.toString();

const buildEmptyFinancialBucket = () => ({
  received: 0,
  paid: 0,
});

const computeFinancialSummaries = (entries) => {
  const monthlyMap = new Map();
  const annualMap = new Map();

  entries.forEach((entry) => {
    const tipo = (entry.tipo ?? "").toLowerCase();
    const status = (entry.status ?? "").toLowerCase();
    const amount =
      Number(entry.valor_parcela ?? entry.valor ?? entry.valor_total ?? 0) || 0;
    if (amount <= 0) return;

    let bucketType = null;
    if (tipo === "receber" && RECEIVED_STATUSES.has(status)) {
      bucketType = "received";
    } else if (tipo === "pagar" && PAID_STATUSES.has(status)) {
      bucketType = "paid";
    } else {
      return;
    }

    const parts =
      parseDateParts(entry.data_prevista, entry.data_emissao) ??
      parseDateParts(entry.created_at);
    if (!parts) return;

    const monthKey = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    const annualKey = parts.year;

    const monthBucket =
      monthlyMap.get(monthKey) ??
      monthlyMap.set(monthKey, buildEmptyFinancialBucket()).get(monthKey);
    monthBucket[bucketType] += amount;

    const annualBucket =
      annualMap.get(annualKey) ??
      annualMap.set(annualKey, buildEmptyFinancialBucket()).get(annualKey);
    annualBucket[bucketType] += amount;
  });

  const monthly = Array.from(monthlyMap.entries())
    .map(([key, stats]) => {
      const [year, month] = key.split("-").map((part) => Number(part));
      return {
        key,
        label: formatMonthLabel(year, month),
        year,
        month,
        received: Number(stats.received.toFixed(2)),
        paid: Number(stats.paid.toFixed(2)),
      };
    })
    .map((row) => ({
      ...row,
      balance: Number((row.received - row.paid).toFixed(2)),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));

  const annual = Array.from(annualMap.entries())
    .map(([year, stats]) => ({
      key: `${year}`,
      label: formatYearLabel(year),
      year: Number(year),
      received: Number(stats.received.toFixed(2)),
      paid: Number(stats.paid.toFixed(2)),
    }))
    .map((row) => ({
      ...row,
      balance: Number((row.received - row.paid).toFixed(2)),
    }))
    .sort((a, b) => b.year - a.year);

  return { monthly, annual };
};

const computeNfeSummaries = (orders) => {
  const monthlyMap = new Map();
  const annualMap = new Map();

  orders.forEach((order) => {
    const amount = Number(order.valor ?? 0) || 0;
    if (amount <= 0) return;

    const parts =
      parseDateParts(order.data_pedido, order.created_at) ??
      parseDateParts(order.created_at);
    if (!parts) return;

    const monthKey = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    const annualKey = parts.year;

    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + amount);
    annualMap.set(annualKey, (annualMap.get(annualKey) || 0) + amount);
  });

  const monthly = Array.from(monthlyMap.entries())
    .map(([key, total]) => {
      const [year, month] = key.split("-").map((part) => Number(part));
      return {
        key,
        label: formatMonthLabel(year, month),
        year,
        month,
        total: Number(total.toFixed(2)),
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));

  const annual = Array.from(annualMap.entries())
    .map(([year, total]) => ({
      key: `${year}`,
      label: formatYearLabel(year),
      year: Number(year),
      total: Number(total.toFixed(2)),
    }))
    .sort((a, b) => b.year - a.year);

  return { monthly, annual };
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
};

const formatShortDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(";") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const buildCsv = (rows) => rows.map((row) => row.map(csvEscape).join(";")).join("\n");

export default function ReportsTab({
  purchaseCandidates = [],
  generatedQuantity = null,
  selectedProject = null,
  items = [],
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [financialEntries, setFinancialEntries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierError, setSupplierError] = useState(null);
  const [supplierMessage, setSupplierMessage] = useState({ type: null, message: "" });
  const [supplierForm, setSupplierForm] = useState({
    nome: "",
    contato: "",
    email: "",
    telefone: "",
    observacoes: "",
  });
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false);
  const [purchaseOrdersError, setPurchaseOrdersError] = useState(null);

  const [poDraftItems, setPoDraftItems] = useState([]);
  const [poMessage, setPoMessage] = useState({ type: null, message: "" });
  const [poForm, setPoForm] = useState({ supplierId: "", notes: "" });
  const [creatingPurchaseOrder, setCreatingPurchaseOrder] = useState(false);

  const [selectedPriceItemId, setSelectedPriceItemId] = useState("");
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceHistoryError, setPriceHistoryError] = useState(null);

  useEffect(() => {
    let isActive = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: agendaRows, error: agendaError }, { data: orderRows, error: ordersError }] =
          await Promise.all([
            supabase.from("agenda_financeira").select("*"),
            supabase.from("pedidos").select("*"),
          ]);
        if (agendaError) throw agendaError;
        if (ordersError) throw ordersError;
        if (!isActive) return;
        setFinancialEntries(Array.isArray(agendaRows) ? agendaRows : []);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
        setError(null);
      } catch (err) {
        console.error("Erro ao carregar dados para relatorios", err);
        if (isActive) setError(err);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    fetchData();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!supplierMessage.type) return undefined;
    const timeout = setTimeout(() => setSupplierMessage({ type: null, message: "" }), 4000);
    return () => clearTimeout(timeout);
  }, [supplierMessage]);

  useEffect(() => {
    if (!poMessage.type) return undefined;
    const timeout = setTimeout(() => setPoMessage({ type: null, message: "" }), 5000);
    return () => clearTimeout(timeout);
  }, [poMessage]);

  const fetchSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      setSuppliers(Array.isArray(data) ? data : []);
      setSupplierError(null);
    } catch (err) {
      console.error("Erro ao carregar fornecedores", err);
      setSupplierError(err);
    } finally {
      setSuppliersLoading(false);
    }
  };

  const fetchPurchaseOrders = async () => {
    setPurchaseOrdersLoading(true);
    try {
      const { data: orderRows, error: orderError } = await supabase
        .from("pedidos_compra")
        .select(
          "id, created_at, updated_at, status, observacoes, total_estimado, fornecedor_id, fornecedor:fornecedores (id, nome, email, telefone)"
        )
        .order("created_at", { ascending: false });
      if (orderError) throw orderError;

      const mappedOrders = (orderRows ?? []).map((order) => ({
        id: order.id,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        status: order.status,
        observacoes: order.observacoes,
        totalEstimado: order.total_estimado,
        fornecedorId: order.fornecedor_id,
        fornecedor: order.fornecedor,
        itens: [],
      }));

      const orderIds = mappedOrders.map((order) => order.id);
      if (orderIds.length) {
        const { data: itemRows, error: itemError } = await supabase
          .from("pedidos_compra_itens")
          .select(
            "id, pedido_id, item_id, quantidade, preco_unitario, lead_time_dias, observacoes, item:itens (id, nome, code)"
          )
          .in("pedido_id", orderIds);
        if (itemError) throw itemError;

        const itemsByOrder = new Map();
        (itemRows ?? []).forEach((item) => {
          const list = itemsByOrder.get(item.pedido_id) ?? [];
          list.push({
            id: item.id,
            pedidoId: item.pedido_id,
            itemId: item.item_id,
            quantidade: Number(item.quantidade ?? 0),
            precoUnitario: item.preco_unitario !== null ? Number(item.preco_unitario) : null,
            leadTimeDias: item.lead_time_dias !== null ? Number(item.lead_time_dias) : null,
            observacoes: item.observacoes ?? "",
            item: item.item ?? null,
          });
          itemsByOrder.set(item.pedido_id, list);
        });

        mappedOrders.forEach((order) => {
          const items = itemsByOrder.get(order.id) ?? [];
          if (order.totalEstimado === null || order.totalEstimado === undefined) {
            const total = items.reduce((sum, item) => {
              if (!Number.isFinite(Number(item.precoUnitario))) return sum;
              return sum + Number(item.precoUnitario) * Number(item.quantidade ?? 0);
            }, 0);
            order.totalEstimado = total > 0 ? Number(total.toFixed(2)) : null;
          }
          order.itens = items;
        });
      }

      setPurchaseOrders(mappedOrders);
      setPurchaseOrdersError(null);
    } catch (err) {
      console.error("Erro ao carregar pedidos de compra", err);
      setPurchaseOrdersError(err);
    } finally {
      setPurchaseOrdersLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchPurchaseOrders();
  }, []);

  const sortedItems = useMemo(
    () =>
      (items ?? [])
        .map((item) => ({
          id: String(item.id),
          name: item.name,
          code: item.code ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [items],
  );

  useEffect(() => {
    if (!sortedItems.length) {
      setSelectedPriceItemId("");
      setPriceHistory([]);
      setPriceHistoryError(null);
      setPriceHistoryLoading(false);
      return;
    }
    setSelectedPriceItemId((current) => {
      if (current && sortedItems.some((item) => item.id === current)) return current;
      return sortedItems[0].id;
    });
  }, [sortedItems]);

  useEffect(() => {
    if (!selectedPriceItemId) {
      setPriceHistory([]);
      setPriceHistoryError(null);
      setPriceHistoryLoading(false);
      return;
    }
    let isActive = true;
    const fetchHistory = async () => {
      setPriceHistoryLoading(true);
      setPriceHistoryError(null);
      try {
        const { data, error } = await supabase
          .from("precos_itens")
          .select("*")
          .eq("item_id", selectedPriceItemId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (!isActive) return;
        const mapped = (data ?? []).map((row) => ({
          id: row.id,
          itemId: row.item_id,
          preco: Number(row.preco ?? 0),
          moeda: row.moeda ?? "BRL",
          source: row.source ?? "",
          createdAt: row.created_at,
        }));
        setPriceHistory(mapped);
      } catch (err) {
        if (isActive) setPriceHistoryError(err);
      } finally {
        if (isActive) setPriceHistoryLoading(false);
      }
    };
    fetchHistory();
    return () => {
      isActive = false;
    };
  }, [selectedPriceItemId]);

  const purchaseCandidatesKey = useMemo(
    () =>
      JSON.stringify(
        (purchaseCandidates ?? []).map((item) => ({
          id: item.id,
          toBuy: Number(item.toBuy ?? 0),
          purchaseLot: Number(item.purchaseLot ?? 0),
          minimumOrderQuantity: Number(item.minimumOrderQuantity ?? 0),
        })),
      ),
    [purchaseCandidates],
  );

  useEffect(() => {
    const nextItems = (purchaseCandidates ?? [])
      .filter((item) => Number(item.toBuy ?? 0) > 0)
      .map((item) => ({
        key: item.id,
        itemId: item.inventoryItemId ? String(item.inventoryItemId) : null,
        name: item.name,
        code: item.code ?? null,
        quantity: Number(item.toBuy ?? 0),
        purchaseLot: item.purchaseLot ? Number(item.purchaseLot) : null,
        minimumOrderQuantity: item.minimumOrderQuantity
          ? Number(item.minimumOrderQuantity)
          : null,
        price: 0,
        leadTimeDias: null,
      }));
    setPoDraftItems(nextItems);
    if (nextItems.length && suppliers.length && !poForm.supplierId) {
      setPoForm((current) => ({ ...current, supplierId: suppliers[0].id }));
    }
  }, [purchaseCandidatesKey, suppliers]);

  const priceChart = useMemo(() => {
    if (!priceHistory.length) return null;
    const entries = priceHistory
      .map((entry) => ({
        ...entry,
        preco: Number(entry.preco ?? 0),
        date: new Date(entry.createdAt),
      }))
      .filter(
        (entry) =>
          Number.isFinite(entry.preco) && !Number.isNaN(entry.date.getTime()),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!entries.length) return null;

    const width = 720;
    const height = 240;
    const paddingX = 50;
    const paddingY = 24;
    const minPrice = entries.reduce(
      (min, entry) => Math.min(min, entry.preco),
      entries[0].preco,
    );
    const maxPrice = entries.reduce(
      (max, entry) => Math.max(max, entry.preco),
      entries[0].preco,
    );
    const range = maxPrice - minPrice || 1;
    const points = entries.map((entry, index) => {
      const ratio =
        entries.length === 1 ? 0.5 : index / (entries.length - 1);
      const x = paddingX + ratio * (width - paddingX * 2);
      const y =
        height -
        paddingY -
        ((entry.preco - minPrice) / range) * (height - paddingY * 2);
      return {
        ...entry,
        x,
        y,
        label: formatShortDate(entry.date),
      };
    });

    return {
      width,
      height,
      paddingX,
      paddingY,
      points,
      minPrice,
      maxPrice,
      currency: entries[0].moeda ?? "BRL",
    };
  }, [priceHistory]);

  const summaries = useMemo(() => {
    const financial = computeFinancialSummaries(financialEntries);
    const nfe = computeNfeSummaries(orders);

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentYear = now.getFullYear();

    const currentFinancialMonthly =
      financial.monthly.find((row) => row.key === currentMonthKey) ??
      { received: 0, paid: 0, balance: 0 };
    const currentFinancialAnnual =
      financial.annual.find((row) => row.year === currentYear) ??
      { received: 0, paid: 0, balance: 0 };
    const currentNfeMonthly =
      nfe.monthly.find((row) => row.key === currentMonthKey) ?? { total: 0 };
    const currentNfeAnnual =
      nfe.annual.find((row) => row.year === currentYear) ?? { total: 0 };

    return {
      financial,
      nfe,
      highlights: {
        currentMonth: {
          received: currentFinancialMonthly.received,
          paid: currentFinancialMonthly.paid,
          balance: currentFinancialMonthly.balance,
          nfe: currentNfeMonthly.total,
        },
        currentYear: {
          received: currentFinancialAnnual.received,
          paid: currentFinancialAnnual.paid,
          balance: currentFinancialAnnual.balance,
          nfe: currentNfeAnnual.total,
        },
      },
    };
  }, [financialEntries, orders]);

  const hasPurchaseCandidates = poDraftItems.length > 0;
  const invalidDraftItems = poDraftItems.filter((item) => !item.itemId);
  const poTotalEstimated = poDraftItems.reduce(
    (sum, item) => sum + Number(item.quantity ?? 0) * (Number(item.price ?? 0) || 0),
    0,
  );

  const hasFinancialData =
    summaries.financial.monthly.length > 0 || summaries.financial.annual.length > 0;
  const hasNfeData =
    summaries.nfe.monthly.length > 0 || summaries.nfe.annual.length > 0;

  const handleSupplierFormChange = (field, value) => {
    setSupplierForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateSupplier = async (event) => {
    event.preventDefault();
    const name = supplierForm.nome.trim();
    if (!name) {
      setSupplierMessage({ type: "error", message: "Informe o nome do fornecedor." });
      return;
    }
    setCreatingSupplier(true);
    try {
      const payload = {
        nome: name,
        contato: supplierForm.contato?.trim() || null,
        email: supplierForm.email?.trim() || null,
        telefone: supplierForm.telefone?.trim() || null,
        observacoes: supplierForm.observacoes?.trim() || null,
      };
      const { data, error } = await supabase
        .from("fornecedores")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      setSupplierMessage({ type: "success", message: "Fornecedor cadastrado." });
      setSupplierForm({
        nome: "",
        contato: "",
        email: "",
        telefone: "",
        observacoes: "",
      });
      setSuppliers((current) => [...current, data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      if (!poForm.supplierId) {
        setPoForm((current) => ({ ...current, supplierId: data.id }));
      }
    } catch (err) {
      console.error("Erro ao criar fornecedor", err);
      setSupplierMessage({
        type: "error",
        message: err?.message ?? "Nao foi possivel criar o fornecedor.",
      });
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handlePoDraftItemChange = (index, field, rawValue) => {
    setPoDraftItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === "quantity") {
          const numeric = Number(rawValue);
          return { ...item, quantity: Number.isFinite(numeric) ? numeric : 0 };
        }
        if (field === "price") {
          const numeric = Number(rawValue);
          return { ...item, price: Number.isFinite(numeric) ? numeric : 0 };
        }
        if (field === "leadTimeDias") {
          const numeric = Number(rawValue);
          return { ...item, leadTimeDias: Number.isFinite(numeric) ? numeric : null };
        }
        return { ...item, [field]: rawValue };
      }),
    );
  };

  const handleRemoveDraftItem = (index) => {
    setPoDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleCreatePurchaseOrder = async () => {
    if (!hasPurchaseCandidates) {
      setPoMessage({
        type: "error",
        message:
          "Nenhum item disponível para gerar o pedido. Gere o relatório de compra na aba Projetos.",
      });
      return;
    }
    if (!poForm.supplierId) {
      setPoMessage({ type: "error", message: "Selecione um fornecedor." });
      return;
    }
    if (invalidDraftItems.length) {
      setPoMessage({
        type: "error",
        message:
          "Alguns itens não estão vinculados ao estoque. Ajuste os componentes antes de gerar o pedido.",
      });
      return;
    }

    const itemsPayload = poDraftItems
      .filter((item) => Number(item.quantity ?? 0) > 0)
      .map((item) => ({
        item_id: item.itemId,
        quantidade: Number(item.quantity ?? 0),
        preco_unitario:
          item.price && Number(item.price) > 0 ? Number(item.price) : null,
        lead_time_dias:
          item.leadTimeDias && Number.isFinite(Number(item.leadTimeDias))
            ? Number(item.leadTimeDias)
            : null,
      }));

    if (!itemsPayload.length) {
      setPoMessage({
        type: "error",
        message: "Nenhum item com quantidade válida para gerar o pedido.",
      });
      return;
    }

    setCreatingPurchaseOrder(true);
    try {
      const totalEstimado =
        poTotalEstimated > 0 ? Number(poTotalEstimated.toFixed(2)) : null;
      const orderPayload = {
        fornecedor_id: poForm.supplierId,
        status: "rascunho",
        observacoes: poForm.notes?.trim() || null,
        total_estimado: totalEstimado,
      };

      const { data: insertedOrder, error: orderError } = await supabase
        .from("pedidos_compra")
        .insert(orderPayload)
        .select(
          "id, created_at, updated_at, status, observacoes, total_estimado, fornecedor_id, fornecedor:fornecedores (id, nome, email, telefone)"
        )
        .single();
      if (orderError) throw orderError;

      const itemsWithOrder = itemsPayload.map((item) => ({
        ...item,
        pedido_id: insertedOrder.id,
      }));
      const { error: itemsError } = await supabase
        .from("pedidos_compra_itens")
        .insert(itemsWithOrder);
      if (itemsError) throw itemsError;

      setPoMessage({
        type: "success",
        message: "Pedido de compra gerado com sucesso.",
      });
      setPoForm((current) => ({ ...current, notes: "" }));
      await fetchPurchaseOrders();
    } catch (err) {
      console.error("Erro ao criar pedido de compra", err);
      setPoMessage({
        type: "error",
        message: err?.message ?? "Não foi possível gerar o pedido de compra.",
      });
    } finally {
      setCreatingPurchaseOrder(false);
    }
  };

  const handleUpdatePurchaseOrderStatus = async (orderId, status) => {
    try {
      const { error: updateError } = await supabase
        .from("pedidos_compra")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (updateError) throw updateError;
      setPurchaseOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status, updatedAt: new Date().toISOString() } : order,
        ),
      );
    } catch (err) {
      console.error("Erro ao atualizar status do pedido", err);
      setPoMessage({
        type: "error",
        message: err?.message ?? "Não foi possível atualizar o status do pedido.",
      });
    }
  };

  const handleDownloadPurchaseOrderPdf = (order) => {
    if (!order) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Pedido de Compra", 40, 40);
    doc.setFontSize(11);
    doc.text(`Código: ${order.id}`, 40, 60);
    doc.text(`Status: ${order.status}`, 40, 75);
    doc.text(`Criado em: ${formatDateTime(order.createdAt)}`, 40, 90);
    if (order.fornecedor) {
      doc.text(`Fornecedor: ${order.fornecedor.nome}`, 40, 105);
      if (order.fornecedor.email) doc.text(`Email: ${order.fornecedor.email}`, 40, 120);
      if (order.fornecedor.telefone) doc.text(`Telefone: ${order.fornecedor.telefone}`, 40, 135);
    }
    if (selectedProject?.metadata?.name) {
      doc.text(
        `Projeto relacionado: ${selectedProject.metadata.name}`,
        40,
        order.fornecedor?.telefone ? 150 : 135,
      );
    }

    autoTable(doc, {
      startY: 160,
      head: [["Código", "Componente", "Quantidade", "Preço unitário", "Lead time (dias)"]],
      body: (order.itens ?? []).map((item) => [
        item.item?.code ?? "-",
        item.item?.nome ?? "Componente",
        Number(item.quantidade ?? 0).toLocaleString("pt-BR"),
        item.precoUnitario !== null ? formatCurrency(item.precoUnitario) : "-",
        item.leadTimeDias ?? "-",
      ]),
    });

    doc.save(`pedido-compra-${order.id}.pdf`);
  };

  const handleDownloadPurchaseOrderCsv = (order) => {
    if (!order) return;
    const rows = [
      [
        "Pedido",
        "Fornecedor",
        "Status",
        "Criado em",
        "Item código",
        "Item nome",
        "Quantidade",
        "Preço unitário",
        "Lead time (dias)",
      ],
    ];
    (order.itens ?? []).forEach((item) => {
      rows.push([
        order.id,
        order.fornecedor?.nome ?? "",
        order.status,
        formatDateTime(order.createdAt),
        item.item?.code ?? "",
        item.item?.nome ?? "",
        Number(item.quantidade ?? 0).toLocaleString("pt-BR"),
        item.precoUnitario !== null ? Number(item.precoUnitario).toString().replace(".", ",") : "",
        item.leadTimeDias !== null ? String(item.leadTimeDias) : "",
      ]);
    });
    const blob = new Blob([`\ufeff${buildCsv(rows)}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pedido-compra-${order.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Carregando relatórios...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <p className="text-sm text-rose-600">
          Não foi possível carregar os dados de relatórios: {error.message}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Gerar Pedido de Compra</h2>
        <p className="mt-1 text-sm text-slate-500">
          Utilize o relatório de compra gerado na aba Projetos para reservar componentes e emitir
          um pedido formal para o fornecedor.
        </p>
        {poMessage.message && (
          <p
            className={`mt-3 rounded-lg border px-4 py-2 text-xs ${
              poMessage.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {poMessage.message}
          </p>
        )}
        {!hasPurchaseCandidates ? (
          <p className="mt-4 text-sm text-slate-500">
            Gere o relatório de compra na aba <strong>Projetos</strong> para montar o pedido.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Fornecedor
                <select
                  value={poForm.supplierId}
                  onChange={(event) =>
                    setPoForm((current) => ({ ...current, supplierId: event.target.value }))
                  }
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                >
                  <option value="">Selecione um fornecedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-600">
                Observações para o pedido
                <textarea
                  rows={2}
                  value={poForm.notes}
                  onChange={(event) =>
                    setPoForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </label>
            </div>
            {invalidDraftItems.length > 0 && (
              <p className="mt-3 text-xs text-amber-600">
                Existem componentes sem vínculo com o estoque. Ajuste as peças na aba Projetos antes
                de gerar o pedido.
              </p>
            )}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Componente</th>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-right">Quantidade</th>
                    <th className="px-3 py-2 text-right">Preço unitário (R$)</th>
                    <th className="px-3 py-2 text-right">Lead time (dias)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {poDraftItems.map((item, index) => {
                    const constraintLabel = formatConstraintLabel(
                      item.purchaseLot,
                      item.minimumOrderQuantity,
                    );
                    return (
                      <tr key={item.key}>
                        <td className="px-3 py-2 text-slate-700">{item.name}</td>
                        <td className="px-3 py-2 text-slate-500">{item.code || "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(event) =>
                              handlePoDraftItemChange(index, "quantity", event.target.value)
                            }
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                          />
                          {constraintLabel && (
                            <p className="mt-1 text-[10px] text-slate-400">{constraintLabel}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(event) =>
                              handlePoDraftItemChange(index, "price", event.target.value)
                            }
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.leadTimeDias ?? ""}
                            onChange={(event) =>
                              handlePoDraftItemChange(index, "leadTimeDias", event.target.value)
                            }
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(index)}
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>
                      Total estimado
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatCurrency(poTotalEstimated)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={handleCreatePurchaseOrder}
                disabled={creatingPurchaseOrder}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
              >
                {creatingPurchaseOrder ? "Gerando pedido..." : "Gerar pedido de compra"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Projeto selecionado:{" "}
              <span className="font-semibold">
                {selectedProject?.metadata?.name ?? "Nenhum projeto selecionado"}
              </span>{" "}
              {generatedQuantity ? `· Quantidade desejada: ${generatedQuantity}` : null}
            </p>
          </>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Fornecedores</h2>
          {supplierMessage.message && (
            <span
              className={`text-xs font-medium ${
                supplierMessage.type === "error" ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {supplierMessage.message}
            </span>
          )}
        </div>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"
          onSubmit={handleCreateSupplier}
        >
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Nome
            <input
              type="text"
              required
              value={supplierForm.nome}
              onChange={(event) => handleSupplierFormChange("nome", event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Contato
            <input
              type="text"
              value={supplierForm.contato}
              onChange={(event) => handleSupplierFormChange("contato", event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Email
            <input
              type="email"
              value={supplierForm.email}
              onChange={(event) => handleSupplierFormChange("email", event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Telefone
            <input
              type="text"
              value={supplierForm.telefone}
              onChange={(event) => handleSupplierFormChange("telefone", event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="md:col-span-2 flex flex-col text-sm font-medium text-slate-600">
            Observações
            <textarea
              rows={2}
              value={supplierForm.observacoes}
              onChange={(event) =>
                handleSupplierFormChange("observacoes", event.target.value)
              }
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={creatingSupplier}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
            >
              {creatingSupplier ? "Salvando..." : "Adicionar fornecedor"}
            </button>
          </div>
        </form>
        <div className="mt-4 overflow-x-auto">
          {supplierError ? (
            <p className="text-sm text-rose-600">
              Erro ao carregar fornecedores: {supplierError.message}
            </p>
          ) : suppliersLoading ? (
            <p className="text-sm text-slate-500">Carregando fornecedores...</p>
          ) : suppliers.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum fornecedor cadastrado ainda.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">Contato</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Telefone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-3 py-2 text-slate-700">{supplier.nome}</td>
                    <td className="px-3 py-2 text-slate-500">{supplier.contato || "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{supplier.email || "-"}</td>
                    <td className="px-3 py-2 text-slate-500">{supplier.telefone || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Pedidos de Compra</h2>
        {purchaseOrdersError ? (
          <p className="mt-3 text-sm text-rose-600">
            Não foi possível carregar os pedidos de compra: {purchaseOrdersError.message}
          </p>
        ) : purchaseOrdersLoading ? (
          <p className="mt-3 text-sm text-slate-500">Carregando pedidos...</p>
        ) : purchaseOrders.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Nenhum pedido registrado ainda. Gere um pedido utilizando o relatório.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {purchaseOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Pedido
                    </p>
                    <p className="text-sm font-semibold text-slate-700">{order.id}</p>
                    <p className="text-xs text-slate-500">
                      Criado em {formatDateTime(order.createdAt)}
                      {order.updatedAt ? ` · Atualizado em ${formatDateTime(order.updatedAt)}` : ""}
                    </p>
                    {order.observacoes && (
                      <p className="mt-1 text-xs text-slate-500">
                        Observações: {order.observacoes}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-700">Fornecedor:</span>{" "}
                      {order.fornecedor?.nome ?? "-"}
                    </p>
                    {order.fornecedor?.email && <p>Email: {order.fornecedor.email}</p>}
                    {order.fornecedor?.telefone && <p>Telefone: {order.fornecedor.telefone}</p>}
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Status
                      <select
                        value={order.status}
                        onChange={(event) =>
                          handleUpdatePurchaseOrderStatus(order.id, event.target.value)
                        }
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                      >
                        {PURCHASE_ORDER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>Total estimado</p>
                    <p className="text-lg font-semibold text-slate-800">
                      {order.totalEstimado ? formatCurrency(order.totalEstimado) : "-"}
                    </p>
                    <div className="mt-3 flex flex-wrap justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleDownloadPurchaseOrderPdf(order)}
                        className="rounded-md border border-sky-300 px-3 py-1 font-semibold text-sky-600 transition hover:bg-sky-50"
                      >
                        Exportar PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPurchaseOrderCsv(order)}
                        className="rounded-md border border-slate-300 px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        Exportar CSV
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Componente</th>
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-right">Quantidade</th>
                        <th className="px-3 py-2 text-right">Preço unitário</th>
                        <th className="px-3 py-2 text-right">Lead time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(order.itens ?? []).map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-slate-700">
                            {item.item?.nome ?? "Componente"}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {item.item?.code ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {Number(item.quantidade ?? 0).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {item.precoUnitario !== null
                              ? formatCurrency(item.precoUnitario)
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {item.leadTimeDias !== null ? item.leadTimeDias : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Histórico de preços</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="price-history-item" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Item
            </label>
            <select
              id="price-history-item"
              value={selectedPriceItemId}
              onChange={(event) => setSelectedPriceItemId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {sortedItems.length === 0 && <option value="">Nenhum item disponível</option>}
              {sortedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` (${item.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        {priceHistoryError ? (
          <p className="mt-3 text-sm text-rose-600">
            Não foi possível carregar o histórico: {priceHistoryError.message}
          </p>
        ) : priceHistoryLoading ? (
          <p className="mt-3 text-sm text-slate-500">Carregando histórico de preços...</p>
        ) : !priceChart || !priceChart.points.length ? (
          <p className="mt-3 text-sm text-slate-500">
            Nenhum registro de preço para este item. Atualize o preço atual na tela de estoque para
            criar o histórico.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <svg
                viewBox={`0 0 ${priceChart.width} ${priceChart.height}`}
                className="h-64 w-full text-sky-600"
                role="img"
              >
                <line
                  x1={priceChart.paddingX}
                  y1={priceChart.height - priceChart.paddingY}
                  x2={priceChart.width - priceChart.paddingX}
                  y2={priceChart.height - priceChart.paddingY}
                  stroke="#cbd5f5"
                  strokeWidth="1"
                />
                <line
                  x1={priceChart.paddingX}
                  y1={priceChart.paddingY}
                  x2={priceChart.paddingX}
                  y2={priceChart.height - priceChart.paddingY}
                  stroke="#cbd5f5"
                  strokeWidth="1"
                />
                {priceChart.points.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    points={priceChart.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  />
                )}
                {priceChart.points.map((point) => (
                  <g key={`${point.itemId ?? ""}-${point.createdAt}`} className="fill-sky-600">
                    <circle cx={point.x} cy={point.y} r="4" />
                    <text
                      x={point.x}
                      y={point.y - 10}
                      fontSize="9"
                      textAnchor="middle"
                      fill="#1d4ed8"
                    >
                      {formatCurrency(point.preco)}
                    </text>
                  </g>
                ))}
                <text
                  x={priceChart.paddingX - 8}
                  y={priceChart.paddingY + 4}
                  fontSize="10"
                  textAnchor="end"
                  fill="#475569"
                >
                  {formatCurrency(priceChart.maxPrice)}
                </text>
                <text
                  x={priceChart.paddingX - 8}
                  y={priceChart.height - priceChart.paddingY}
                  fontSize="10"
                  textAnchor="end"
                  fill="#475569"
                >
                  {formatCurrency(priceChart.minPrice)}
                </text>
                {priceChart.points.map((point) => (
                  <text
                    key={`${point.itemId ?? ""}-${point.createdAt}-label`}
                    x={point.x}
                    y={priceChart.height - priceChart.paddingY + 16}
                    fontSize="9"
                    textAnchor="middle"
                    fill="#475569"
                  >
                    {point.label}
                  </text>
                ))}
              </svg>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Preço</th>
                    <th className="px-3 py-2 text-left">Moeda</th>
                    <th className="px-3 py-2 text-left">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {priceHistory
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    )
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-3 py-2 text-slate-600">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatCurrency(entry.preco)}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{entry.moeda}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {entry.source ? entry.source : "-"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Agenda financeira — destaques</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Recebido no mês
            </p>
            <p className="mt-2 text-lg font-semibold text-emerald-600">
              {formatCurrency(summaries.highlights.currentMonth.received)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Pago no mês
            </p>
            <p className="mt-2 text-lg font-semibold text-rose-600">
              {formatCurrency(summaries.highlights.currentMonth.paid)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Saldo no mês
            </p>
            <p
              className={`mt-2 text-lg font-semibold ${
                summaries.highlights.currentMonth.balance >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            >
              {formatCurrency(summaries.highlights.currentMonth.balance)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              NF-es no mês
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-700">
              {formatCurrency(summaries.highlights.currentMonth.nfe)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">
          Agenda financeira — resumo mensal
        </h2>
        {!hasFinancialData ? (
          <p className="mt-3 text-sm text-slate-500">
            Cadastre novos pagamentos ou recebimentos para gerar o consolidado mensal.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Mês</th>
                  <th className="px-4 py-2 text-right">Recebido</th>
                  <th className="px-4 py-2 text-right">Pago</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {summaries.financial.monthly.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 text-slate-600 capitalize">{row.label}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">
                      {formatCurrency(row.received)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">
                      {formatCurrency(row.paid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        row.balance >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">
          Agenda financeira — resumo anual
        </h2>
        {!hasFinancialData ? (
          <p className="mt-3 text-sm text-slate-500">
            Cadastre novos pagamentos ou recebimentos para gerar o consolidado anual.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ano</th>
                  <th className="px-4 py-2 text-right">Recebido</th>
                  <th className="px-4 py-2 text-right">Pago</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {summaries.financial.annual.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 text-slate-600">{row.label}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">
                      {formatCurrency(row.received)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">
                      {formatCurrency(row.paid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        row.balance >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">NF-es — valores declarados</h2>
        {!hasNfeData ? (
          <p className="mt-3 text-sm text-slate-500">
            Nenhum pedido com NF-e foi localizado. Cadastre pedidos na tela “Pedidos” para gerar
            este relatório.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Mês</th>
                    <th className="px-4 py-2 text-right">Total NF-es</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {summaries.nfe.monthly.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3 text-slate-600 capitalize">{row.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Ano</th>
                    <th className="px-4 py-2 text-right">Total NF-es</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {summaries.nfe.annual.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3 text-slate-600">{row.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
