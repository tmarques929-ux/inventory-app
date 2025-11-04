const fs = require('fs');
const path = 'src/pages/dashboard/ReportsTab.jsx';
let text = fs.readFileSync(path, 'utf8');
const original = text;
text = text.replace(/\r\n/g, '\n');

if (!text.includes('return parts.join(" - ");')) {
  text = text.replace('return parts.join(" · ");', 'return parts.join(" - ");');
}

if (!text.includes('const formatQuantity =')) {
  const marker = 'const csvEscape = (value) => {';
  const helpers = const formatQuantity = (value) => {\n  const numeric = Number(value);\n  if (!Number.isFinite(numeric)) return "0";\n  return numeric.toLocaleString("pt-BR");\n};\n\nconst parseQuantityInput = (value) => {\n  if (value === null || value === undefined || value === "") return 0;\n  const normalized = String(value).trim().replace(",", ".");\n  const parsed = Number(normalized);\n  return Number.isFinite(parsed) ? parsed : NaN;\n};\n\n;
  if (!text.includes(marker)) {
    throw new Error('csvEscape marker not found');
  }
  text = text.replace(marker, helpers + marker);
}

if (!text.includes('const [receiptSavingOrderId')) {
  const stateBlock =   const [purchaseOrders, setPurchaseOrders] = useState([]);\n  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false);\n  const [purchaseOrdersError, setPurchaseOrdersError] = useState(null);\n  const [poReceiptMessage, setPoReceiptMessage] = useState({ type: null, message: "" });\n  const [receiptEdits, setReceiptEdits] = useState({});\n;
  const replacement =   const [purchaseOrders, setPurchaseOrders] = useState([]);\n  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false);\n  const [purchaseOrdersError, setPurchaseOrdersError] = useState(null);\n  const [poReceiptMessage, setPoReceiptMessage] = useState({ type: null, message: "" });\n  const [receiptEdits, setReceiptEdits] = useState({});\n  const [receiptSavingOrderId, setReceiptSavingOrderId] = useState(null);\n;
  if (!text.includes(stateBlock)) {
    throw new Error('State block not found');
  }
  text = text.replace(stateBlock, replacement);
}

if (!text.includes('const handleReceiptEditChange')) {
  const statusBlock =   const handleUpdatePurchaseOrderStatus = async (orderId, status) => {\n    try {\n      const { error: updateError } = await supabase\n        .from("pedidos_compra")\n        .update({ status, updated_at: new Date().toISOString() })\n        .eq("id", orderId);\n      if (updateError) throw updateError;\n      setPurchaseOrders((current) =>\n        current.map((order) =>\n          order.id === orderId ? { ...order, status, updatedAt: new Date().toISOString() } : order,\n        ),\n      );\n    } catch (err) {\n      console.error("Erro ao atualizar status do pedido", err);\n      setPoMessage({\n        type: "error",\n        message: err?.message ?? "Não foi possível atualizar o status do pedido.",\n      });\n    }\n  };\n\n;
  if (!text.includes(statusBlock)) {
    throw new Error('Status handler block not found');
  }
  const handlersInsertion =   const handleReceiptEditChange = (itemId, rawValue) => {\n    setReceiptEdits((current) => ({\n      ...current,\n      [itemId]: rawValue,\n    }));\n  };\n\n  const handleReceiptFillMax = (itemId, quantity) => {\n    setReceiptEdits((current) => ({\n      ...current,\n      [itemId]: String(Number(quantity ?? 0)),\n    }));\n  };\n\n  const handleSaveReceipt = async (orderId) => {\n    const order = purchaseOrders.find((currentOrder) => currentOrder.id === orderId);\n    if (!order) return;\n\n    const updates = [];\n    for (const item of order.itens ?? []) {\n      const hasEdit = Object.prototype.hasOwnProperty.call(receiptEdits, item.id);\n      const rawValue = hasEdit ? receiptEdits[item.id] : item.quantidadeRecebida ?? 0;\n      const parsed = parseQuantityInput(rawValue);\n      if (Number.isNaN(parsed)) {\n        setPoReceiptMessage({\n          type: "error",\n          message: \Quantidade inválida para \\. Utilize apenas números.\,\n        });\n        return;\n      }\n      const maxQuantity = Number(item.quantidade ?? 0) || 0;\n      if (parsed < 0 || parsed > maxQuantity) {\n        setPoReceiptMessage({\n          type: "error",\n          message: \A quantidade recebida de \\ deve ser entre 0 e \\.\,\n        });\n        return;\n      }\n      const currentReceived = Number(item.quantidadeRecebida ?? 0) || 0;\n      if (Math.abs(parsed - currentReceived) >= 0.000001) {\n        updates.push({\n          id: item.id,\n          quantidade_recebida: Number(parsed.toFixed(6)),\n        });\n      }\n    }\n\n    if (!updates.length) {\n      setPoReceiptMessage({\n        type: "info",\n        message: "Nenhuma alteração de recebimento para salvar.",\n      });\n      return;\n    }\n\n    setReceiptSavingOrderId(orderId);\n    try {\n      const { error: updateError } = await supabase.from("pedidos_compra_itens").upsert(updates);\n      if (updateError) throw updateError;\n\n      const quantitiesByItemId = new Map(\n        (order.itens ?? []).map((item) => [item.id, Number(item.quantidadeRecebida ?? 0) || 0]),\n      );\n      updates.forEach((update) => {\n        quantitiesByItemId.set(update.id, Number(update.quantidade_recebida ?? 0));\n      });\n\n      const receiptSummary = (order.itens ?? []).reduce(\n        (acc, item) => {\n          const ordered = Number(item.quantidade ?? 0) || 0;\n          const received = quantitiesByItemId.get(item.id) ?? 0;\n          acc.totalOrdered += ordered;\n          acc.totalReceived += received;\n          if (received > 0) acc.hasAnyReceipt = true;\n          if (ordered > 0 && received < ordered) acc.hasPending = true;\n          return acc;\n        },\n        { totalOrdered: 0, totalReceived: 0, hasAnyReceipt: false, hasPending: false },\n      );\n\n      let nextStatus = order.status;\n      if (receiptSummary.totalOrdered > 0) {\n        const fullyReceived = !receiptSummary.hasPending;\n        if (fullyReceived && receiptSummary.totalReceived >= receiptSummary.totalOrdered) {\n          nextStatus = "concluido";\n        } else if (receiptSummary.hasAnyReceipt) {\n          nextStatus = "parcialmente_recebido";\n        } else if (order.status === "parcialmente_recebido" || order.status === "concluido") {\n          nextStatus = "enviado";\n        }\n      }\n\n      if (nextStatus !== order.status) {\n        const { error: statusError } = await supabase\n          .from("pedidos_compra")\n          .update({ status: nextStatus, updated_at: new Date().toISOString() })\n          .eq("id", orderId);\n        if (statusError) throw statusError;\n      }\n\n      setPoReceiptMessage({\n        type: "success",\n        message: "Recebimento atualizado com sucesso.",\n      });\n      await fetchPurchaseOrders();\n    } catch (err) {\n      console.error("Erro ao registrar recebimento parcial", err);\n      setPoReceiptMessage({\n        type: "error",\n        message: err?.message ?? "Não foi possível salvar o recebimento.",\n      });\n    } finally {\n      setReceiptSavingOrderId(null);\n    }\n  };\n\n;
  text = text.replace(statusBlock, statusBlock + handlersInsertion);
}

const autoTableOriginal =     autoTable(doc, {\n      startY: 160,\n      head: [["Código", "Componente", "Quantidade", "Preço unitário", "Lead time (dias)"]],\n      body: (order.itens ?? []).map((item) => [\n        item.item?.code ?? "-",\n        item.item?.nome ?? "Componente",\n        Number(item.quantidade ?? 0).toLocaleString("pt-BR"),\n        item.precoUnitario !== null ? formatCurrency(item.precoUnitario) : "-",\n        item.leadTimeDias ?? "-",\n      ]),\n    });;
const autoTableReplacement =     autoTable(doc, {\n      startY: 160,\n      head: [["Código", "Componente", "Solicitado", "Recebido", "Preço unitário", "Lead time (dias)"]],\n      body: (order.itens ?? []).map((item) => [\n        item.item?.code ?? "-",\n        item.item?.nome ?? "Componente",\n        formatQuantity(item.quantidade ?? 0),\n        formatQuantity(item.quantidadeRecebida ?? 0),\n        item.precoUnitario !== null ? formatCurrency(item.precoUnitario) : "-",\n        item.leadTimeDias ?? "-",\n      ]),\n    });;
text = text.replace(autoTableOriginal, autoTableReplacement);

const csvHeaderOriginal =     const rows = [\n      [\n        "Pedido",\n        "Fornecedor",\n        "Status",\n        "Criado em",\n        "Item código",\n        "Item nome",\n        "Quantidade",\n        "Preço unitário",\n        "Lead time (dias)",\n      ],\n    ];;
const csvHeaderReplacement =     const rows = [\n      [\n        "Pedido",\n        "Fornecedor",\n        "Status",\n        "Criado em",\n        "Item código",\n        "Item nome",\n        "Quantidade",\n        "Quantidade recebida",\n        "Preço unitário",\n        "Lead time (dias)",\n      ],\n    ];;
text = text.replace(csvHeaderOriginal, csvHeaderReplacement);

const csvRowOriginal =     (order.itens ?? []).forEach((item) => {\n      rows.push([\n        order.id,\n        order.fornecedor?.nome ?? "",\n        order.status,\n        formatDateTime(order.createdAt),\n        item.item?.code ?? "",\n        item.item?.nome ?? "",\n        Number(item.quantidade ?? 0).toLocaleString("pt-BR"),\n        item.precoUnitario !== null ? Number(item.precoUnitario).toString().replace(".", ",") : "",\n        item.leadTimeDias !== null ? String(item.leadTimeDias) : "",\n      ]);\n    });;
const csvRowReplacement =     (order.itens ?? []).forEach((item) => {\n      rows.push([\n        order.id,\n        order.fornecedor?.nome ?? "",\n        order.status,\n        formatDateTime(order.createdAt),\n        item.item?.code ?? "",\n        item.item?.nome ?? "",\n        formatQuantity(item.quantidade ?? 0),\n        formatQuantity(item.quantidadeRecebida ?? 0),\n        item.precoUnitario !== null ? Number(item.precoUnitario).toString().replace(".", ",") : "",\n        item.leadTimeDias !== null ? String(item.leadTimeDias) : "",\n      ]);\n    });;
text = text.replace(csvRowOriginal, csvRowReplacement);

if (text === original.replace(/\r\n/g, '\n')) {
  console.warn('No changes applied by script');
}

fs.writeFileSync(path, text.replace(/\n/g, '\r\n'));
