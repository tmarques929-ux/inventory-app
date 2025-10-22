export const ROLE_PERMISSIONS = {
  admin: {
    manageProjects: true,
    manageStock: true,
  },
  operator: {
    manageProjects: false,
    manageStock: true,
  },
  viewer: {
    manageProjects: false,
    manageStock: false,
  },
};

export const DEFAULT_ROLE = "operator";

// Map e-mails (lowercase) to specific roles when Supabase metadata is not available.
// Example: { "admin@empresa.com": "admin" }
export const USER_ROLE_OVERRIDES = {
  "contato@wltautomacao.com.br": "admin",
};
