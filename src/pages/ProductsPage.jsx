import Dashboard from "./Dashboard";

export default function ProductsPage() {
  return (
    <Dashboard
      allowedTabs={["projects"]}
      heroEyebrow="Produtos"
      heroTitle="Produtos e Kits"
      heroSubtitle="Gerencie os projetos, valores de placas prontas e listas de montagem disponiveis."
    />
  );
}
