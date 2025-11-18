import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PermissionsProvider } from "./context/PermissionsContext";
import { InventoryProvider } from "./context/InventoryContext";
import { ValueVisibilityProvider } from "./context/ValueVisibilityContext";
import SideNav from "./components/SideNav";
import ScrollToTopButton from "./components/ScrollToTopButton";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import InventoryList from "./pages/InventoryList";
import InventoryForm from "./pages/InventoryForm";
import OrdersPage from "./pages/OrdersPage";
import DocumentsPage from "./pages/DocumentsPage";
import ContactsPage from "./pages/ContactsPage";
import FinancialSchedule from "./pages/FinancialSchedule";
import ProductsPage from "./pages/ProductsPage";
import BudgetGenerator from "./pages/BudgetGenerator";

function ProtectedLayout() {
  const { user } = useAuth();
  const [collapsedNav, setCollapsedNav] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <SideNav collapsed={collapsedNav} onToggle={() => setCollapsedNav((prev) => !prev)} />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
        <ScrollToTopButton />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ValueVisibilityProvider>
        <PermissionsProvider>
          <InventoryProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<Navigate to="/estoque" replace />} />
                <Route
                  path="/estoque"
                  element={
                    <Dashboard
                      allowedTabs={["stock", "history"]}
                      heroEyebrow="Operacoes"
                      heroTitle="Estoque e movimentacoes"
                      heroSubtitle="Acompanhe quantidades disponiveis, ajuste entradas e saidas e consulte o historico completo."
                    />
                  }
                />
                <Route path="/produtos" element={<ProductsPage />} />
                <Route path="/inventory" element={<InventoryList />} />
                <Route path="/inventory/new" element={<InventoryForm />} />
                <Route path="/inventory/:id" element={<InventoryForm />} />
                <Route path="/pedidos" element={<OrdersPage />} />
                <Route path="/orcamentos" element={<BudgetGenerator />} />
                <Route path="/documentos" element={<DocumentsPage />} />
                <Route path="/contatos" element={<ContactsPage />} />
                <Route path="/agenda-financeira" element={<FinancialSchedule />} />
                <Route
                  path="/relatorios"
                  element={
                    <Dashboard
                      allowedTabs={["reports"]}
                      heroEyebrow="Visão gerencial"
                      heroTitle="Relatórios financeiros e fiscais"
                      heroSubtitle="Acompanhe recebimentos, pagamentos e o total de NF-es emitidas por mês e por ano."
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/estoque" replace />} />
              </Route>
            </Routes>
          </InventoryProvider>
        </PermissionsProvider>
      </ValueVisibilityProvider>
    </AuthProvider>
  );
}
