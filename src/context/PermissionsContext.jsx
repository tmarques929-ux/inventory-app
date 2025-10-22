import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { DEFAULT_ROLE, ROLE_PERMISSIONS, USER_ROLE_OVERRIDES } from "../config/roles.js";

const PermissionsContext = createContext({
  role: DEFAULT_ROLE,
  permissions: ROLE_PERMISSIONS[DEFAULT_ROLE],
  hasPermission: () => false,
});

const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const deriveRole = (user) => {
  if (!user) return DEFAULT_ROLE;

  const metaRole =
    normalize(user?.app_metadata?.role) ||
    normalize(user?.user_metadata?.role) ||
    normalize(user?.role);
  if (metaRole && ROLE_PERMISSIONS[metaRole]) return metaRole;

  const email = normalize(user?.email);
  if (email && USER_ROLE_OVERRIDES[email] && ROLE_PERMISSIONS[USER_ROLE_OVERRIDES[email]]) {
    return USER_ROLE_OVERRIDES[email];
  }

  const envDefault = normalize(import.meta.env?.VITE_DEFAULT_ROLE);
  if (envDefault && ROLE_PERMISSIONS[envDefault]) return envDefault;

  return DEFAULT_ROLE;
};

export function PermissionsProvider({ children }) {
  const { user } = useAuth();

  const contextValue = useMemo(() => {
    const role = deriveRole(user);
    const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
    const hasPermission = (action) => Boolean(permissions[action]);

    return {
      role,
      permissions,
      hasPermission,
    };
  }, [user]);

  return <PermissionsContext.Provider value={contextValue}>{children}</PermissionsContext.Provider>;
}

export const usePermissions = () => {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions deve ser utilizado dentro de PermissionsProvider");
  }
  return ctx;
};

