import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import wltLogoSrc from "../assets/wlt-logo.png";
import { supabase } from "../supabaseClient";
import { useNotifications } from "../context/NotificationContext";
import { usePermissions } from "../context/PermissionsContext";
import { useValueVisibility } from "../context/ValueVisibilityContext";
import { COMPANY_DOCUMENTS_BUCKET } from "../config/storage";

const COMPANY_INFO = {
  name: "WLT Automação",
  email: "contato@wltautomacao.com.br",
  phone: "(12) 99189-4964",
};

const DEFAULT_PAYMENT_TERMS = "50% para iniciar e 50% na entrega";
const DEFAULT_DEVELOPMENT_TIME = "5 semanas";
const DEFAULT_PRODUCTION_TIME =
  "10 semanas (inclui compra de componentes, confecção da PCB e montagem das placas; pode variar em volumes elevados, ex.: 2000 unidades)";
const DEFAULT_OBSERVATIONS = [
  "Garantia de 6 meses a partir da entrega.",
  "Inclusos 2 protótipos.",
  "Após aprovação, não serão permitidas alterações estruturais significativas no projeto.",
].join("\n");


const DEFAULT_USD_RATE_SEED = Number(import.meta.env.VITE_USD_EXCHANGE_RATE ?? "5");
const DEFAULT_USD_RATE =
  Number.isFinite(DEFAULT_USD_RATE_SEED) && DEFAULT_USD_RATE_SEED > 0 ? DEFAULT_USD_RATE_SEED : 5;
const SUPPORTED_CURRENCIES = ["BRL", "USD"];

const initialItem = () => ({
  description: "",
  quantity: 1,
  unitPrice: 0,
  currency: "BRL",
});

const sanitizeStorageFileName = (rawName, fallbackPrefix = "orcamento") => {
  if (!rawName) return `${fallbackPrefix}-${Date.now()}`;
  return rawName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || `${fallbackPrefix}-${Date.now()}`;
};

const formatCurrency = (value, currency = "BRL") => {
  const numeric = Number(value);
  const safeAmount = Number.isFinite(numeric) ? numeric : 0;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(safeAmount);
  } catch (_err) {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
};

export default function BudgetGenerator() {
  const { notifyError, notifySuccess } = useNotifications();
  const { hasPermission } = usePermissions();
  const { maskValue } = useValueVisibility();
  const canSaveDocuments = hasPermission("manageDocuments");

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDocument, setCompanyDocument] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [proposalValidityDays, setProposalValidityDays] = useState(15);
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [developmentTime, setDevelopmentTime] = useState(DEFAULT_DEVELOPMENT_TIME);
  const [productionTime, setProductionTime] = useState(DEFAULT_PRODUCTION_TIME);
  const [notes, setNotes] = useState(DEFAULT_OBSERVATIONS);
const [items, setItems] = useState([initialItem()]);
const [exchangeRates, setExchangeRates] = useState({ BRL: 1, USD: DEFAULT_USD_RATE });
const [saving, setSaving] = useState(false);
const [logoDataUrl, setLogoDataUrl] = useState(null);
const [watermarkDataUrl, setWatermarkDataUrl] = useState(null);
const assetsCacheRef = useRef({ logo: null, watermark: null, promise: null });

  useEffect(() => {
    let isActive = true;
    const fetchUsdRate = async () => {
      try {
        const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const bid = Number(data?.USDBRL?.bid);
        if (!isActive) return;
        if (Number.isFinite(bid) && bid > 0) {
          setExchangeRates({ BRL: 1, USD: bid });
        }
      } catch (err) {
        if (isActive) {
          console.warn("Falha ao atualizar taxa USD/BRL. Usando valor padr\ão.", err);
        }
      }
    };
    fetchUsdRate();
    const interval = setInterval(fetchUsdRate, 60 * 60 * 1000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  const loadImageAsPngDataUrl = useCallback(async (src, label) => {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const width = image.naturalWidth || image.width || 512;
          const height = image.naturalHeight || image.height || 512;
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Contexto 2D indispon\ível para convers\ão de imagem.");
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = (error) => {
        URL.revokeObjectURL(objectUrl);
        reject(error ?? new Error(`Falha ao carregar ${label ?? "imagem"}`));
      };
      image.src = objectUrl;
    });
  }, []);

  const deriveWatermarkFromLogo = useCallback(async (logoData) => {
    if (!logoData) return null;
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const width = image.naturalWidth || image.width || 512;
          const height = image.naturalHeight || image.height || 512;
          const iconSize = Math.min(width, height);
          const canvas = document.createElement("canvas");
          canvas.width = iconSize;
          canvas.height = iconSize;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Contexto 2D indispon\ível para gerar marca d'\água.");
          context.drawImage(image, 0, 0, iconSize, iconSize, 0, 0, iconSize, iconSize);
          resolve({ dataUrl: canvas.toDataURL("image/png"), aspectRatio: width / height || 1 });
        } catch (err) {
          reject(err);
        }
      };
      image.onerror = (error) =>
        reject(error ?? new Error("Falha ao derivar marca d'\água a partir do logotipo."));
      image.src = logoData;
    });
  }, []);

  const loadAssets = useCallback(async () => {
    if (typeof window === "undefined") {
      return {
        logo: assetsCacheRef.current.logo,
        watermark: assetsCacheRef.current.watermark,
      };
    }

    if (assetsCacheRef.current.logo && assetsCacheRef.current.watermark) {
      return {
        logo: assetsCacheRef.current.logo,
        watermark: assetsCacheRef.current.watermark,
      };
    }

    if (assetsCacheRef.current.promise) {
      return assetsCacheRef.current.promise;
    }

    assetsCacheRef.current.promise = (async () => {
      try {
        const logo = await loadImageAsPngDataUrl(wltLogoSrc, "logotipo da WLT").catch((err) => {
          console.warn("Falha ao carregar o logotipo da WLT para o PDF.", err);
          return null;
        });

        if (logo) {
          assetsCacheRef.current.logo = logo;
          setLogoDataUrl(logo);
          const watermarkCandidate = await deriveWatermarkFromLogo(logo).catch((err) => {
            console.warn("Falha ao preparar a marca d'\água da WLT para o PDF.", err);
            return null;
          });
          if (watermarkCandidate) {
            assetsCacheRef.current.watermark = watermarkCandidate;
            setWatermarkDataUrl(watermarkCandidate);
          } else {
            assetsCacheRef.current.watermark = null;
            setWatermarkDataUrl(null);
          }
        }
      } catch (err) {
        console.warn("Falha ao carregar recursos de imagem para o PDF.", err);
      } finally {
        const result = {
          logo: assetsCacheRef.current.logo,
        watermark: assetsCacheRef.current.watermark,
        };
        assetsCacheRef.current.promise = null;
        return result;
      }
    })();

      return assetsCacheRef.current.promise;
  }, [deriveWatermarkFromLogo, loadImageAsPngDataUrl]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const convertCurrency = (amount, fromCurrency, toCurrency) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return 0;
    const from = typeof fromCurrency === "string" ? fromCurrency.toUpperCase() : "BRL";
    const to = typeof toCurrency === "string" ? toCurrency.toUpperCase() : "BRL";
    if (from === to) return numericAmount;
    const fromRate = Number(exchangeRates[from] ?? 1);
    const toRate = Number(exchangeRates[to] ?? 1);
    const baseAmount = numericAmount * (Number.isFinite(fromRate) && fromRate > 0 ? fromRate : 1);
    const divisor = Number.isFinite(toRate) && toRate > 0 ? toRate : 1;
    return baseAmount / divisor;
  };

  const sanitizeItems = (list) =>
    list
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        currency: item.currency || "BRL",
      }))
      .filter((item) => item.description && item.quantity > 0 && item.unitPrice >= 0);

  const totalsByCurrency = useMemo(() => {
    return sanitizeItems(items).reduce((acc, item) => {
      const total = item.quantity * item.unitPrice;
      if (!acc[item.currency]) acc[item.currency] = 0;
      acc[item.currency] += total;
      return acc;
    }, {});
  }, [items]);

  const totalBRL = useMemo(() => {
    return Object.entries(totalsByCurrency).reduce(
      (sum, [currency, amount]) => sum + convertCurrency(amount, currency, "BRL"),
      0,
    );
  }, [totalsByCurrency]);

  const handleItemChange = (index, field, value) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]:
                field === "description"
                  ? value
                  : field === "currency"
                    ? value
                    : Number(value),
            }
          : item,
      ),
    );
  };

  const addItem = () => setItems((current) => [...current, initialItem()]);
  const removeItem = (index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const buildPdf = ({ logo, watermark }) => {
    const doc = new jsPDF();

    // Moldura externa
    doc.setLineWidth(0.6);
    doc.setDrawColor(20, 24, 32);
    doc.rect(10, 10, 190, 277);

    const resolvedLogo = logo ?? logoDataUrl ?? null;
    const resolvedWatermark =
      (watermark && typeof watermark === "object"
        ? watermark
        : typeof watermarkDataUrl === "object"
        ? watermarkDataUrl
        : null);

    const watermarkSource = resolvedWatermark?.dataUrl ?? null;
    const pageCenterX = doc.internal.pageSize.getWidth() / 2;
    const pageCenterY = doc.internal.pageSize.getHeight() / 2;

    if (watermarkSource) {
      let watermarkAspectRatio = 1;
      try {
        const watermarkProps = doc.getImageProperties(watermarkSource);
        if (watermarkProps?.width && watermarkProps?.height) {
          watermarkAspectRatio = watermarkProps.width / watermarkProps.height;
        }
      } catch (err) {
        console.warn("N\ão foi poss\ível calcular propor\ç\ão da marca d'\água da WLT.", err);
      }

      try {
        const save = doc.saveGraphicsState?.bind(doc);
        const restore = doc.restoreGraphicsState?.bind(doc);
        save?.();
        if (typeof doc.GState === "function" && typeof doc.setGState === "function") {
          const watermarkState = doc.GState({ opacity: 0.06 });
          doc.setGState(watermarkState);
        }
        const watermarkWidth = 220;
        const watermarkHeight = watermarkWidth / watermarkAspectRatio;
        const watermarkX = pageCenterX - watermarkWidth / 2;
        const watermarkY = pageCenterY - watermarkHeight / 2 + 20;
        doc.addImage(
          watermarkSource,
          "PNG",
          watermarkX,
          watermarkY,
          watermarkWidth,
          watermarkHeight,
        );
        restore?.();
      } catch (err) {
        console.warn("Falha ao adicionar marca d'\água da WLT ao PDF.", err);
      }
    }

    if (resolvedLogo) {
      let logoAspectRatio = 1;
      try {
        const logoProps = doc.getImageProperties(resolvedLogo);
        if (logoProps?.width && logoProps?.height) {
          logoAspectRatio = logoProps.width / logoProps.height;
        }
      } catch (err) {
        console.warn("N\ão foi poss\ível calcular propor\ç\ão do logotipo da WLT.", err);
      }

      try {
        const headerWidth = 38;
        const headerHeight = headerWidth / logoAspectRatio;
        const headerX = pageCenterX - headerWidth / 2;
        const headerY = 18;
        doc.addImage(resolvedLogo, "PNG", headerX, headerY, headerWidth, headerHeight);
      } catch (err) {
        console.warn("Falha ao adicionar logotipo da WLT ao cabe\çalho do PDF.", err);
      }
    }
    const today = new Date();
    const validity = Number(proposalValidityDays) || 0;
    const validityDate = new Date(today);
    validityDate.setDate(validityDate.getDate() + validity);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Proposta Comercial", 105, 42, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    let currentY = 52;
    doc.text(`Data: ${today.toLocaleDateString("pt-BR")}`, 20, currentY);
    currentY += 6;
    doc.text(
      `Validade: ${
        validity > 0 ? `${validity} dia(s) (${validityDate.toLocaleDateString("pt-BR")})` : "A combinar"
      }`,
      20,
      currentY,
    );
    currentY += 12;

    doc.setFont("helvetica", "bold");
    doc.text("Cliente", 20, currentY);
    currentY += 6;

    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${clientName || "-"}`, 20, currentY);
    currentY += 6;
    doc.text(`Empresa: ${companyName || "-"}`, 20, currentY);
    currentY += 6;
    doc.text(`CNPJ: ${companyDocument || "-"}`, 20, currentY);
    currentY += 6;
    doc.text(`Contato: ${clientEmail || "-"} | ${clientPhone || "-"}`, 20, currentY);
    currentY += 8;

    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_INFO.name, 20, currentY);
    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.text(`E-mail: ${COMPANY_INFO.email}`, 20, currentY);
    currentY += 6;
    doc.text(`Telefone: ${COMPANY_INFO.phone}`, 20, currentY);
    currentY += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Projeto", 20, currentY);
    currentY += 6;
    doc.setFont("helvetica", "normal");

    let detailY = currentY;
    const drawDetailLine = (label, value) => {
      const content = `${label}: ${value || "-"}`;
      const lines = doc.splitTextToSize(content, 170);
      doc.text(lines, 20, detailY);
      detailY += lines.length * 6;
    };

    drawDetailLine("T\ítulo/escopo", projectTitle);
    drawDetailLine("Condi\ç\ões de pagamento", paymentTerms);

    doc.setFont("helvetica", "bold");
    doc.text("Prazos", 20, detailY);
    detailY += 6;
    doc.setFont("helvetica", "normal");
    drawDetailLine("Desenvolvimento", developmentTime);
    drawDetailLine("Produ\ç\ão", productionTime);

    const tableStartY = Math.max(detailY + 6, 130);

    const validItems = sanitizeItems(items);
    const tableRows = validItems.length
      ? validItems.map((item, index) => {
          const subtotal = item.quantity * item.unitPrice;
          return [
            index + 1,
            item.description,
            item.quantity,
            `${formatCurrency(item.unitPrice, item.currency)} (${item.currency})`,
            `${formatCurrency(subtotal, item.currency)} (${item.currency})`,
          ];
        })
      : [["-", "Sem itens informados", "-", "-", "-"]];

    autoTable(doc, {
      head: [["#", "Descri\ç\ão", "Qtd.", "Valor unit\ário", "Subtotal"]],
      body: tableRows,
      startY: tableStartY,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 76, 129], textColor: 255 },
    });

    let summaryY = doc.lastAutoTable?.finalY ?? 140;
    summaryY += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Resumo financeiro", 20, summaryY);
    summaryY += 6;
    doc.setFont("helvetica", "normal");
    Object.entries(totalsByCurrency).forEach(([currency, amount]) => {
      doc.text(`${currency}: ${formatCurrency(amount, currency)}`, 20, summaryY);
      summaryY += 5;
    });
    doc.text(`Equivalente em BRL: ${formatCurrency(totalBRL, "BRL")}`, 20, summaryY);
    summaryY += 8;

    if (notes.trim()) {
      doc.setFont("helvetica", "bold");
      doc.text("Observa\ç\ões", 20, summaryY);
      summaryY += 6;
      doc.setFont("helvetica", "normal");
      const splitNotes = doc.splitTextToSize(notes.trim(), 170);
      doc.text(splitNotes, 20, summaryY);
      summaryY += splitNotes.length * 5 + 4;
    }

    doc.setFont("helvetica", "italic");
    doc.text(
      "A equipe WLT Automa\ç\ão agradece a oportunidade. Estamos dispon\íveis para ajustes ou esclarecimentos.",
      20,
      Math.min(summaryY + 6, 280),
    );

    return doc;
  };

  const savePdfToDocuments = async (pdfBlob, storagePath, name, description) => {
    const { error: uploadError } = await supabase.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .upload(storagePath, pdfBlob, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      });
    if (uploadError) throw uploadError;

    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser();
    if (getUserError) throw getUserError;

    const { error: insertError } = await supabase.from("documentos").insert({
      name,
      description: description || null,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: pdfBlob.size ?? null,
      category: "Orcamento",
      created_by: user?.id ?? null,
    });
    if (insertError) throw insertError;
  };

  const handleGenerate = async (options = { download: true, saveToDocuments: false }) => {
    try {
      if (!clientName.trim()) {
        notifyError("Informe o nome do cliente antes de gerar o or\çamento.");
        return;
      }

      const assets = await loadAssets();
      const pdf = buildPdf({
        logo: assets?.logo ?? logoDataUrl ?? null,
        watermark: assets?.watermark ?? watermarkDataUrl ?? null,
      });
      const safeClientName = clientName.trim() || "cliente";
      const baseFileName = sanitizeStorageFileName(`${safeClientName}-${Date.now()}`);

      if (options.download) {
        pdf.save(`${baseFileName}.pdf`);
      }

      if (options.saveToDocuments && canSaveDocuments) {
        setSaving(true);
        const pdfBlob = pdf.output("blob");
        const storagePath = `${Date.now()}-${baseFileName}.pdf`;
        await savePdfToDocuments(
          pdfBlob,
          storagePath,
          `Or\çamento - ${clientName}`,
          projectTitle || `Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
        );
        notifySuccess("Or\çamento salvo em Documentos.");
      } else if (options.saveToDocuments && !canSaveDocuments) {
        notifyError("Voc\ê n\ão possui permiss\ão para salvar or\çamentos nos Documentos.");
      }
    } catch (err) {
      console.error("Falha ao gerar or\çamento", err);
      notifyError(err?.message ?? "N\ão foi poss\ível gerar o PDF.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Comercial
            </p>
            <h1 className="text-2xl font-bold text-slate-800 md:text-3xl">Gerador de Orçamentos</h1>
            <p className="mt-2 text-sm text-slate-500">
              Preencha os dados do cliente, itens e observações. Gere o PDF com o padrão da WLT e, se desejar, salve no
              modulo de Documentos.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold">Contato WLT</p>
            <p>{COMPANY_INFO.email}</p>
            <p>{COMPANY_INFO.phone}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Dados do cliente</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Nome do cliente
            <input
              type="text"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              required
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Empresa (opcional)
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            CNPJ (ou CPF)
            <input
              type="text"
              value={companyDocument}
              onChange={(event) => setCompanyDocument(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            E-mail
            <input
              type="email"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Telefone
            <input
              type="tel"
              value={clientPhone}
              onChange={(event) => setClientPhone(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
            />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Projeto e condições</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Título / escopo do projeto
            <textarea
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              rows={2}
              className="mt-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
                placeholder="Ex.: Desenvolvimento de módulo IoT"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Validade da proposta (dias)
            <input
              type="number"
              min="0"
              step="1"
              value={proposalValidityDays}
              onChange={(event) => setProposalValidityDays(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600 md:col-span-2">
            Condições de pagamento
            <textarea
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
              rows={2}
              className="mt-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Tempo estimado de desenvolvimento
            <input
              type="text"
              value={developmentTime}
              onChange={(event) => setDevelopmentTime(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
              placeholder="Ex.: 5 semanas"
            />
          </label>
          <label className="flex flex-col text-sm font-medium text-slate-600">
            Tempo estimado para produção
            <textarea
              value={productionTime}
              onChange={(event) => setProductionTime(event.target.value)}
              rows={2}
              className="mt-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
              placeholder="Ex.: 10 semanas"
            />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Itens do orçamento</h2>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
          >
            Adicionar item
          </button>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pl-0 pr-3 text-left">Descrição</th>
                <th className="px-3 py-2 text-center">Qtd.</th>
                <th className="px-3 py-2 text-center">Valor unitário</th>
                <th className="px-3 py-2 text-center">Moeda</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {items.map((item, index) => {
                const quantity = Number(item.quantity) || 0;
                const unitPrice = Number(item.unitPrice) || 0;
                const subtotal = quantity * unitPrice;
                return (
                  <tr key={index}>
                    <td className="py-2 pl-0 pr-3 align-top">
                      <textarea
                        rows={2}
                        value={item.description}
                        onChange={(event) => handleItemChange(index, "description", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
                        placeholder="Descreva o item ou servico"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantity}
                        onChange={(event) => handleItemChange(index, "quantity", event.target.value)}
                        className="mx-auto w-24 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) => handleItemChange(index, "unitPrice", event.target.value)}
                        className="mx-auto w-28 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <select
                        value={item.currency}
                        onChange={(event) => handleItemChange(index, "currency", event.target.value)}
                        className="mx-auto rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
                      >
                        {SUPPORTED_CURRENCIES.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top text-right text-sm text-slate-600">
                      {maskValue(formatCurrency(subtotal, item.currency))}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="rounded border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                        disabled={items.length === 1}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Observações adicionais</h2>
        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500/40"
          placeholder="Inclua garantias, prazos ou outras consideracoes importantes."
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Resumo</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(totalsByCurrency).map(([currency, amount]) => (
            <div key={currency} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Total em {currency}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-800">
                {maskValue(formatCurrency(amount, currency))}
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Equivalente em BRL</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">
              {maskValue(formatCurrency(totalBRL, "BRL"))}
            </p>
            <p className="text-[11px] text-slate-400">
              USD para BRL:{" "}
              {exchangeRates.USD ? maskValue(formatCurrency(exchangeRates.USD, "BRL")) : "N/D"} (fonte: AwesomeAPI)
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleGenerate({ download: true, saveToDocuments: false })}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            Gerar PDF
          </button>
          <button
            type="button"
            onClick={() => handleGenerate({ download: true, saveToDocuments: true })}
            disabled={saving || !canSaveDocuments}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-5 py-2 text-sm font-semibold text-sky-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Gerar e salvar em Documentos"}
          </button>
          <a
            href="/documentos"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
          >
            Abrir Documentos
          </a>
        </div>
        {!canSaveDocuments && (
          <p className="mt-3 text-xs text-amber-600">
            Você possui acesso apenas para gerar o PDF localmente. Solicite a um administrador para habilitar o salvamento
            em Documentos.
          </p>
        )}
      </section>
    </div>
  );
}











