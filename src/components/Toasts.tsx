import { useGate } from "../store/useGate";

export function Toasts() {
  const toasts = useGate((s) => s.toasts);
  const dismiss = useGate((s) => s.dismissToast);

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.kind}`} key={toast.id} role="alert">
          <div className="toast-head">
            <strong>{toast.kind === "error" ? "⛔ " : "✅ "}{toast.title}</strong>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)}>×</button>
          </div>
          {toast.messages && toast.messages.length > 0 && (
            <ul className="toast-body">
              {toast.messages.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
