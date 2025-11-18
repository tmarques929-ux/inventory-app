
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "wlt-values-hidden";
const MASK_PLACEHOLDER = "••••";

const ValueVisibilityContext = createContext(null);

export function ValueVisibilityProvider({ children }) {
  const [areValuesHidden, setAreValuesHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setAreValuesHidden(stored === "true");
    } catch (_err) {
      setAreValuesHidden(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, areValuesHidden ? "true" : "false");
    } catch (_err) {
      // Ignore persistence errors (private mode, etc.)
    }

    const root = document.documentElement;
    if (root) {
      root.setAttribute("data-values-hidden", areValuesHidden ? "true" : "false");
    }
  }, [areValuesHidden]);

  const toggleValues = useCallback(() => {
    setAreValuesHidden((prev) => !prev);
  }, []);

  const maskValue = useCallback(
    (value, options = {}) => {
      if (!areValuesHidden) return value;
      const placeholder = options.placeholder ?? MASK_PLACEHOLDER;
      if (options.keepLength && typeof value === "string" && value.trim().length > 0) {
        const masked = value.replace(/\S/g, "•");
        return masked.trim().length > 0 ? masked : placeholder;
      }
      return placeholder;
    },
    [areValuesHidden]
  );

  const contextValue = useMemo(
    () => ({
      areValuesHidden,
      toggleValues,
      setValuesHidden: setAreValuesHidden,
      maskValue,
      placeholder: MASK_PLACEHOLDER,
    }),
    [areValuesHidden, maskValue]
  );

  return (
    <ValueVisibilityContext.Provider value={contextValue}>
      {children}
    </ValueVisibilityContext.Provider>
  );
}

export function useValueVisibility() {
  const context = useContext(ValueVisibilityContext);
  if (!context) {
    throw new Error("useValueVisibility must be used within a ValueVisibilityProvider");
  }
  return context;
}
