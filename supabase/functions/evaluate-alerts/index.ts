// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.43.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const INTERNAL_SERVICE_TOKEN = Deno.env.get("EVALUATE_ALERTS_SERVICE_TOKEN") ?? "";
const DEFAULT_WEBHOOK_URL = Deno.env.get("ALERTS_WEBHOOK_URL") ?? "";

if (!SUPABASE_URL) {
  console.error("Missing Supabase URL. Check function environment variables.");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY is not set. Internal mode will be disabled.");
}
if (!SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_ANON_KEY is not set. User-triggered evaluations will fail.");
}

type AlertRule = {
  min_threshold?: number;
  webhook_url?: string;
  days_before_due?: number;
  purchase_order_id?: string;
};

type AlertRecord = {
  id: string;
  tipo: string;
  regra: AlertRule;
  item_id: string | null;
  ativo: boolean;
  ultimo_disparo: string | null;
  owner_id?: string | null;
  itens?: {
    id: string;
    nome?: string;
    quantidade?: number;
    lote_compra?: number | null;
    moq?: number | null;
  } | null;
};

type AuthContext =
  | { mode: "internal"; supabase: SupabaseClient }
  | { mode: "user"; supabase: SupabaseClient; userId: string };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const timingSafeEquals = (a: string, b: string) => {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    mismatch |= aBytes[i] ^ bBytes[i];
  }
  return mismatch === 0;
};

const resolveAuthContext = async (req: Request): Promise<AuthContext | Response> => {
  if (!SUPABASE_URL) {
    return jsonResponse(500, { error: "Supabase URL not configured" });
  }

  const internalSecretHeader = req.headers.get("x-evaluate-alerts-secret");
  if (internalSecretHeader) {
    if (!INTERNAL_SERVICE_TOKEN) {
      return jsonResponse(401, { error: "Internal secret not configured" });
    }
    if (!timingSafeEquals(internalSecretHeader, INTERNAL_SERVICE_TOKEN)) {
      return jsonResponse(401, { error: "Invalid internal secret" });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { error: "Supabase service role key not configured" });
    }
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    return { mode: "internal", supabase: client };
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  if (!SUPABASE_ANON_KEY) {
    return jsonResponse(500, { error: "Supabase anon key not configured" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonResponse(401, { error: "Invalid or expired token" });
  }

  return { mode: "user", supabase, userId: user.id };
};

const sendNotification = async (payload: Record<string, unknown>, webhookUrl?: string) => {
  const url = webhookUrl || DEFAULT_WEBHOOK_URL;
  if (!url) {
    console.warn("Notification skipped because webhook URL is not defined.", payload);
    return { delivered: false, reason: "no-webhook-url" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error("Webhook responded with error", await response.text());
      return { delivered: false, reason: `http-${response.status}` };
    }
    return { delivered: true };
  } catch (error) {
    console.error("Failed to call webhook", error);
    return { delivered: false, reason: "network-error" };
  }
};

const evaluateStockAlert = (alert: AlertRecord) => {
  const rules = alert.regra || {};
  const minThreshold = Number(rules.min_threshold ?? 0);
  const available = Number(alert.itens?.quantidade ?? 0);
  if (Number.isNaN(minThreshold) || minThreshold <= 0) {
    return null;
  }
  if (available >= minThreshold) {
    return null;
  }

  return {
    title: "Estoque abaixo do limite",
    severity: "warning",
    message: `O item "${alert.itens?.nome ?? alert.item_id}" estǭ com ${available} unidades em estoque (limite: ${minThreshold}).`,
    alertId: alert.id,
    itemId: alert.item_id,
    available,
    minThreshold,
  };
};

const evaluateLeadTimeAlert = async (
  alert: AlertRecord,
  supabaseClient: SupabaseClient,
) => {
  const rules = alert.regra || {};
  const daysBeforeDue = Number(rules.days_before_due ?? 2);
  const purchaseOrderId = rules.purchase_order_id;
  if (!purchaseOrderId) return null;

  const { data: order, error } = await supabaseClient
    .from("pedidos")
    .select("id, fornecedor, lead_time_dias, data_pedido, status")
    .eq("id", purchaseOrderId)
    .maybeSingle();

  if (error || !order) return null;

  const leadTimeDays = Number(order.lead_time_dias ?? 0);
  if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0) return null;

  const orderDate = order.data_pedido ? new Date(order.data_pedido) : null;
  if (!orderDate || Number.isNaN(orderDate.getTime())) return null;

  const dueDate = new Date(orderDate);
  dueDate.setDate(dueDate.getDate() + leadTimeDays);

  const now = new Date();
  const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > daysBeforeDue) return null;

  return {
    title: "Pedido de compra pr��ximo do vencimento",
    severity: diffDays < 0 ? "error" : "warning",
    message:
      `Pedido ${order.id} (${order.fornecedor ?? "Fornecedor desconhecido"}) ` +
      `vence em ${diffDays} dia(s). Status atual: ${order.status ?? "-"}.`,
    alertId: alert.id,
    purchaseOrderId: order.id,
    dueDate: dueDate.toISOString(),
    daysRemaining: diffDays,
  };
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authContext = await resolveAuthContext(req);
  if (authContext instanceof Response) {
    return authContext;
  }

  const { supabase, mode } = authContext;
  const ownerId = mode === "user" ? authContext.userId : null;

  let alertsQuery = supabase
    .from("alertas")
    .select("*, itens:item_id (id, nome, quantidade, lote_compra, moq)")
    .eq("ativo", true);

  if (ownerId) {
    alertsQuery = alertsQuery.eq("owner_id", ownerId);
  }

  const { data: alerts, error } = await alertsQuery;

  if (error) {
    console.error("Failed to fetch alerts", error);
    return jsonResponse(500, { error: "Failed to fetch alerts" });
  }

  const notifications: Record<string, unknown>[] = [];
  const evaluationResults: Array<Record<string, unknown>> = [];

  for (const alert of (alerts as AlertRecord[])) {
    let result: Record<string, unknown> | null = null;
    try {
      if (alert.tipo === "estoque_minimo") {
        result = evaluateStockAlert(alert);
      } else if (alert.tipo === "po_lead_time") {
        result = await evaluateLeadTimeAlert(alert, supabase);
      }

      if (result) {
        notifications.push({
          alertId: alert.id,
          type: alert.tipo,
          ...result,
        });

        const webhookUrl = alert.regra?.webhook_url;
        const notificationPayload = {
          ...result,
          type: alert.tipo,
          triggeredAt: new Date().toISOString(),
        };
        await sendNotification(notificationPayload, webhookUrl);

        await supabase
          .from("alertas")
          .update({ ultimo_disparo: new Date().toISOString() })
          .eq("id", alert.id);
      }
    } catch (err) {
      console.error(`Failed to evaluate alert ${alert.id}`, err);
      evaluationResults.push({ alertId: alert.id, error: `${err}` });
    }
  }

  return jsonResponse(200, {
    processed: alerts?.length ?? 0,
    notifications,
    evaluationErrors: evaluationResults,
    mode,
  });
});
