export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  message: string;
  kind: ToastKind;
  ttl: number;
};

type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitToast(message: string, kind: ToastKind = "info", ttl = 3200) {
  const toast: Toast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    kind,
    ttl,
  };
  listeners.forEach((fn) => fn(toast));
}
