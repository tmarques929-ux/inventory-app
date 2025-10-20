import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkBaseClasses =
  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkInactiveClasses = "text-slate-500 hover:bg-slate-100 hover:text-slate-800";
const linkActiveClasses = "bg-sky-100 text-sky-700 border border-sky-200";

const navItems = [
  { to: "/estoque", label: "Estoque", icon: "\u{1F4E6}" }, // package
  { to: "/produtos", label: "Produtos", icon: "\u{1F9F7}" }, // puzzle piece
  { to: "/inventory", label: "Itens cadastrados", icon: "\u{1F4C2}" }, // file cabinet
  { to: "/pedidos", label: "Pedidos", icon: "\u{1F4DD}" }, // memo
  { to: "/agenda-financeira", label: "Agenda financeira", icon: "\u{1F4B0}" }, // money bag
  { to: "/contatos", label: "Clientes & Fornecedores", icon: "\u{1F91D}" }, // handshake
];

export default function SideNav({ collapsed = false, onToggle }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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
          {collapsed ? "WLT" : "WLT Automacao"}
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

      {user && (
        <div className="border-t border-slate-200 px-4 py-4">
          {!collapsed && (
            <p className="mb-2 truncate text-xs text-slate-500" title={user.email}>
              {user.email}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Sair
          </button>
        </div>
      )}
    </aside>
  );
}
