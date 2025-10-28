export const ROLE_PERMISSIONS = {
  admin: {
    manageProjects: true,
    manageStock: true,
    manageDocuments: true,
  },
  operator: {
    manageProjects: false,
    manageStock: true,
    manageDocuments: false,
  },
  viewer: {
    manageProjects: false,
    manageStock: false,
    manageDocuments: false,
  },
};

export const DEFAULT_ROLE = "operator";

// Map e-mails (lowercase) to specific roles when Supabase metadata is not available.
// Example: { "admin@empresa.com": "admin" }
export const USER_ROLE_OVERRIDES = {
  "contato@wltautomacao.com.br": "admin",
  "thiagomrib@wltautomacao.com.br": "admin",
  "welsiqueira@wltautomacao.com.br": "admin",
  "lucasgodoy@wltautomacao.com.br": "admin",
};
