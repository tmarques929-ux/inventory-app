import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkBaseClasses =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkInactiveClasses = "text-slate-500 hover:bg-slate-100 hover:text-slate-800";
const linkActiveClasses = "bg-sky-100 text-sky-700 border border-sky-200";

export default function SideNav({ collapsed = false, onToggle }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const renderLink = (to, label) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        [linkBaseClasses, isActive ? linkActiveClasses : linkInactiveClasses].join(" ")
      }
    >
      <span className="truncate">{label}</span>
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
          {collapsed ? "IA" : "Inventory App"}
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
        {renderLink("/estoque", "Estoque")}
        {renderLink("/produtos", "Produtos")}
        {renderLink("/inventory", "Itens cadastrados")}
        {renderLink("/pedidos", "Pedidos")}
        {renderLink("/agenda-financeira", "Agenda financeira")}
        {renderLink("/contatos", "Clientes & Fornecedores")}
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






