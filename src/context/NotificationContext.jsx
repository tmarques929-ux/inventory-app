import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const NotificationContext = createContext(null);

const DEFAULT_DURATION = 5000;
let notificationId = 0;

const buildId = () => {
  notificationId += 1;
  if (notificationId > Number.MAX_SAFE_INTEGER) notificationId = 1;
  return `toast-${Date.now().toString(32)}-${notificationId.toString(32)}`;
};

const typeStyles = {
  info: "border-slate-200 bg-white text-slate-700 shadow-md",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-lg",
  warning: "border-amber-200 bg-amber-50 text-amber-700 shadow-lg",
  error: "border-rose-200 bg-rose-50 text-rose-700 shadow-lg",
};

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setNotifications((previous) => previous.filter((notification) => notification.id !== id));
    const timeoutId = timersRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    ({ type = "info", title = "", message, duration = DEFAULT_DURATION } = {}) => {
      if (!message) return null;
      const id = buildId();
      setNotifications((previous) => [...previous, { id, type, title, message }]);

      if (duration !== null) {
        const timeoutId = setTimeout(() => {
          dismiss(id);
        }, duration);
        timersRef.current.set(id, timeoutId);
      }

      return id;
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      timersRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timersRef.current.clear();
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      notify,
      dismiss,
      notifyInfo: (message, options = {}) => notify({ type: "info", message, ...options }),
      notifySuccess: (message, options = {}) => notify({ type: "success", message, ...options }),
      notifyWarning: (message, options = {}) => notify({ type: "warning", message, ...options }),
      notifyError: (message, options = {}) => notify({ type: "error", message, ...options }),
    }),
    [notify, dismiss],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex max-w-sm flex-col gap-3">
        {notifications.map(({ id, type, title, message }) => (
          <div
            key={id}
            className={`pointer-events-auto overflow-hidden rounded-xl border px-4 py-3 text-sm ${typeStyles[type] ?? typeStyles.info}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                {title ? <p className="text-sm font-semibold">{title}</p> : null}
                <p className="text-sm leading-relaxed">{message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(id)}
                className="rounded-full p-1 text-xs font-semibold text-slate-500 transition hover:bg-black/5 hover:text-slate-700"
                aria-label="Fechar notificacao"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications deve ser utilizado dentro de NotificationProvider");
  }
  return ctx;
};

