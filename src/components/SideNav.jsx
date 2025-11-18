import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import { useValueVisibility } from "../context/ValueVisibilityContext";

const linkBaseClasses =
  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkInactiveClasses = "text-slate-500 hover:bg-slate-100 hover:text-slate-800";
const linkActiveClasses = "bg-sky-100 text-sky-700 border border-sky-200";

const navItems = [
  { to: "/estoque", label: "Estoque", icon: "\u{1F4E6}" }, // package
  { to: "/produtos", label: "Produtos", icon: "\u{1F9F7}" }, // puzzle piece
  { to: "/inventory", label: "Itens cadastrados", icon: "\u{1F4C2}" }, // file cabinet
  { to: "/pedidos", label: "Pedidos", icon: "\u{1F4DD}" }, // memo
  { to: "/orcamentos", label: "Orçamentos", icon: "\u{1F4B1}" }, // currency exchange
  { to: "/agenda-financeira", label: "Agenda financeira", icon: "\u{1F4B0}" }, // money bag
  { to: "/relatorios", label: "Relatórios", icon: "\u{1F4CA}" }, // bar chart
  { to: "/contatos", label: "Clientes & Fornecedores", icon: "\u{1F91D}" }, // handshake
  { to: "/documentos", label: "Documentos", icon: "\u{1F4C4}" }, // page facing up
];

const getUserAlias = (user) => {
  if (!user) return "";
  const metadataAlias = typeof user?.user_metadata?.username === "string"
    ? user.user_metadata.username.trim()
    : "";
  if (metadataAlias) return metadataAlias;
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (!email) return "";
  const atIndex = email.indexOf("@");
  return atIndex > 0 ? email.slice(0, atIndex) : email;
};

export default function SideNav({ collapsed = false, onToggle }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [usdRate, setUsdRate] = useState(null);
  const [usdUpdatedAt, setUsdUpdatedAt] = useState(null);
  const [usdError, setUsdError] = useState(null);
  const { hasPermission, role } = usePermissions();
  const isAdmin = hasPermission("manageProjects") && role === "admin";
  const { areValuesHidden, toggleValues, maskValue } = useValueVisibility();

  useEffect(() => {
    let isMounted = true;
    const fetchUsdRate = async () => {
      try {
        const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const quote = data?.USDBRL;
        const bid = Number(quote?.bid);
        if (isMounted && Number.isFinite(bid)) {
          setUsdRate(bid);
          setUsdUpdatedAt(new Date());
          setUsdError(null);
        }
      } catch (err) {
        if (!isMounted) return;
        setUsdError("Falha ao atualizar cotação");
      }
    };

    fetchUsdRate();
    const interval = setInterval(fetchUsdRate, 60_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const renderLink = ({ to, label, icon }) => (
    <NavLink
      key={to}
      to={to}
      title={label}
      className={({ isActive }) =>
        [
          linkBaseClasses,
          collapsed ? "justify-center gap-0" : "gap-3",
          isActive ? linkActiveClasses : linkInactiveClasses,
        ].join(" ")
      }
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {collapsed && <span className="sr-only">{label}</span>}
    </NavLink>
  );

  return (
    <aside
      className={`relative flex h-full w-64 flex-col border-r border-slate-200 bg-white transition-all duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <span className="text-base font-semibold text-slate-700">
          {collapsed ? "WLT" : "WLT Automação"}
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Alternar menu"
          >
            <span className="text-lg leading-none">{collapsed ? ">" : "<"}</span>
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-2 px-3 py-4">
        {navItems.map(renderLink)}
      </nav>
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={toggleValues}
          aria-pressed={areValuesHidden}
          className={`flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-semibold transition ${
            areValuesHidden
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
          title={areValuesHidden ? "Mostrar valores" : "Ocultar valores"}
        >
          <span aria-hidden="true">{areValuesHidden ? "🙈" : "👁️"}</span>
          {!collapsed && (
            <span>{areValuesHidden ? "Mostrar valores" : "Ocultar valores"}</span>
          )}
          {collapsed && (
            <span className="sr-only">
              {areValuesHidden ? "Mostrar valores" : "Ocultar valores"}
            </span>
          )}
        </button>
        {!collapsed && (
          <p className="mt-2 text-[11px] text-slate-500">
            {areValuesHidden
              ? "Os valores monetarios estao ocultos."
              : "Clique para ocultar todos os valores monetarios da tela."}
          </p>
        )}
      </div>

      {user && (
        <div className="border-t border-slate-200 px-4 py-4">
          {!collapsed && (
            <>
              <p className="mb-1 text-xs font-semibold text-slate-500">
                {isAdmin ? "Perfil: Administrador" : "Perfil: Operador"}
              </p>
              <p className="mb-2 truncate text-xs text-slate-500" title={user.email}>
                {getUserAlias(user) || user.email || "Usuário"}
              </p>
            </>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Sair
          </button>
          <div className={`mt-3 ${collapsed ? "text-center" : ""}`}>
            {usdRate ? (
              <p
                className={`text-xs font-medium text-slate-600 ${
                  collapsed ? "whitespace-nowrap" : ""
                }`}
              >
                USD hoje:{" "}
                <span className="font-semibold text-slate-800">
                  {maskValue(`R$ ${usdRate.toFixed(2)}`)}
                </span>
                {!collapsed && usdUpdatedAt && (
                  <span className="block text-[10px] font-normal text-slate-400">
                    Atualizado às{" "}
                    {usdUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </p>
            ) : usdError ? (
              !collapsed && (
                <p className="text-[10px] text-rose-500">{usdError}</p>
              )
            ) : (
              <p className="text-[10px] text-slate-400">Atualizando USD...</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
