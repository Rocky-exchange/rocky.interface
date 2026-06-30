import { useEffect, useState } from "react";

import styles from "./LighterToast.module.scss";
import { subscribeToasts, type Toast } from "./toastBus";

type Tracked = Toast & { leaving?: boolean };

export function LighterToastContainer() {
  const [items, setItems] = useState<Tracked[]>([]);

  useEffect(() => {
    return subscribeToasts((t) => {
      setItems((prev) => [...prev, t]);
      window.setTimeout(() => {
        setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, leaving: true } : x)));
      }, t.ttl);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, t.ttl + 260);
    });
  }, []);

  if (!items.length) return null;

  return (
    <div className={styles.container}>
      {items.map((t) => (
        <div key={t.id} className={`${styles.toast} ${t.leaving ? styles.toastExit : ""}`}>
          <ToastIcon kind={t.kind} />
          <div className={styles.message}>{t.message}</div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="close"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastIcon({ kind }: { kind: Toast["kind"] }) {
  if (kind === "success") {
    return (
      <span className={`${styles.icon} ${styles.iconSuccess}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (kind === "error") {
    return (
      <span className={`${styles.icon} ${styles.iconError}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`${styles.icon} ${styles.iconInfo}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </span>
  );
}
